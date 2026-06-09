import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import { dbProfiles, dbDrafts } from '@jobagent/shared/src/index';
import { Profile, Seniority } from '@jobagent/shared/src/interfaces/profile';
import { MatchBreakdown } from '@jobagent/shared/src/interfaces/job';

const SENIORITY_ORDER: Seniority[] = ['junior', 'mid', 'senior', 'staff', 'principal'];

interface MatchConfig {
  keep_top_n: number;
  min_score: number;
  weights: {
    role_match: number;
    stack_match: number;
    seniority: number;
    location: number;
    comp: number;
    company_quality: number;
  };
}

interface ScoredPosting {
  posting_id: string;
  company: string;
  role_title: string;
  score: number;
  breakdown: MatchBreakdown;
}

export default class MatchingAgent implements JobAgent {
  name = 'MatchingAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();
    const config = input.config as unknown as MatchConfig;

    const keepTopN = config.keep_top_n || 15;
    const minScore = config.min_score || 0.7;
    const weights = config.weights || {
      role_match: 0.3,
      stack_match: 0.25,
      seniority: 0.15,
      location: 0.15,
      comp: 0.1,
      company_quality: 0.05,
    };

    // Load profile
    const profileRow = await dbProfiles.findByUserId(input.userId);
    if (!profileRow) {
      return {
        data: { error: 'No profile found', matches: [] },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }
    const profile = profileRow.data;

    // Get verified/suspicious postings from this run
    const dedupOutput = input.previousOutputs.get('dedup');
    const postingIds: string[] = dedupOutput?.data
      ? (dedupOutput.data as { unique_posting_ids?: string[] }).unique_posting_ids || []
      : [];

    if (postingIds.length === 0) {
      return {
        data: { matches: [], total_scored: 0 },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Fetch postings (exclude scams)
    const { rows: postings } = await pool.query<{
      id: string;
      company: string;
      role_title: string;
      data: Record<string, unknown>;
      authenticity: string | null;
    }>(
      `SELECT id, company, role_title, data, authenticity FROM job_postings
        WHERE id = ANY($1) AND (authenticity IS NULL OR authenticity != 'scam')`,
      [postingIds],
    );

    // Score each posting
    const scored: ScoredPosting[] = [];
    const exclusionLog: string[] = [];

    for (const posting of postings) {
      const jobData = posting.data as Record<string, unknown>;

      // Hard exclusions
      const exclusion = this.checkExclusions(posting.company, jobData, profile);
      if (exclusion) {
        exclusionLog.push(`${posting.company} - ${posting.role_title}: ${exclusion}`);
        continue;
      }

      const breakdown = this.scorePosting(posting, jobData, profile, weights);
      const score = Object.entries(weights).reduce(
        (sum, [key, weight]) => sum + (breakdown[key as keyof MatchBreakdown] || 0) * weight,
        0,
      );

      if (score >= minScore) {
        scored.push({
          posting_id: posting.id,
          company: posting.company,
          role_title: posting.role_title,
          score,
          breakdown,
        });
      }
    }

    // Sort by score and keep top N
    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, keepTopN);

    // Create draft records for top matches
    const draftIds: string[] = [];
    for (const match of topMatches) {
      // Check if draft already exists
      const existing = await dbDrafts.findByUserAndPosting(input.userId, match.posting_id);
      if (existing) {
        draftIds.push(existing.id);
        continue;
      }

      const draft = await dbDrafts.create({
        user_id: input.userId,
        posting_id: match.posting_id,
        match_score: match.score,
        match_breakdown: match.breakdown,
        status: 'pending_review',
      });
      draftIds.push(draft.id);
    }

    return {
      data: {
        matches: topMatches,
        draft_ids: draftIds,
        total_scored: postings.length,
        total_excluded: exclusionLog.length,
        exclusion_log: exclusionLog,
      },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  private checkExclusions(company: string, _jobData: Record<string, unknown>, profile: Profile): string | null {
    const normalizedCompany = company.toLowerCase().trim();

    // Excluded companies
    for (const excluded of profile.excluded_companies) {
      if (normalizedCompany.includes(excluded.toLowerCase())) {
        return `excluded company: ${excluded}`;
      }
    }

    return null;
  }

  private scorePosting(
    posting: { company: string; role_title: string },
    jobData: Record<string, unknown>,
    profile: Profile,
    _weights: MatchConfig['weights'],
  ): MatchBreakdown {
    const description = ((jobData.description_md as string) || '').toLowerCase();
    const roleTitle = posting.role_title.toLowerCase();

    // Role match: keyword overlap between target roles and posting title
    const roleMatch = this.computeRoleMatch(roleTitle, profile.target_roles);

    // Stack match: count of profile.stack items in description
    const stackMatch = this.computeStackMatch(description, profile.stack);

    // Seniority match
    const seniorityMatch = this.computeSeniorityMatch(roleTitle, profile.seniority);

    // Location match
    const locationMatch = this.computeLocationMatch(jobData, profile);

    // Comp match
    const compMatch = this.computeCompMatch(jobData, profile);

    // Company quality (baseline 1.0, penalized for excluded companies/industries)
    const companyQuality = 1.0;

    return {
      role_match: roleMatch,
      stack_match: stackMatch,
      seniority: seniorityMatch,
      location: locationMatch,
      comp: compMatch,
      company_quality: companyQuality,
    };
  }

  private computeRoleMatch(roleTitle: string, targetRoles: string[]): number {
    let bestMatch = 0;
    for (const target of targetRoles) {
      const targetWords = target.toLowerCase().split(/\s+/);
      const matchedWords = targetWords.filter((w) => roleTitle.includes(w));
      const score = matchedWords.length / targetWords.length;
      bestMatch = Math.max(bestMatch, score);
    }
    return bestMatch;
  }

  private computeStackMatch(description: string, stack: string[]): number {
    if (stack.length === 0) return 0.5;
    const matched = stack.filter((s) => description.includes(s.toLowerCase()));
    return matched.length / stack.length;
  }

  private computeSeniorityMatch(roleTitle: string, targetSeniority: Seniority): number {
    const detectedSeniority = this.detectSeniority(roleTitle);
    if (!detectedSeniority) return 0.7; // Unknown = neutral
    const targetIdx = SENIORITY_ORDER.indexOf(targetSeniority);
    const detectedIdx = SENIORITY_ORDER.indexOf(detectedSeniority);
    const diff = Math.abs(targetIdx - detectedIdx);
    if (diff === 0) return 1.0;
    if (diff === 1) return 0.5;
    return 0.0;
  }

  private detectSeniority(roleTitle: string): Seniority | null {
    if (roleTitle.includes('principal') || roleTitle.includes('distinguished')) return 'principal';
    if (roleTitle.includes('staff')) return 'staff';
    if (roleTitle.includes('senior') || roleTitle.includes('sr.')) return 'senior';
    if (roleTitle.includes('junior') || roleTitle.includes('jr.') || roleTitle.includes('entry')) return 'junior';
    return 'mid'; // Default to mid if no indicator
  }

  private computeLocationMatch(jobData: Record<string, unknown>, profile: Profile): number {
    const remote = (jobData.remote as string) || 'unknown';
    const postingLocation = ((jobData.location as string) || '').toLowerCase();

    if (profile.location_prefs.remote === 'required') {
      return remote === 'fully' ? 1.0 : 0.2;
    }
    if (profile.location_prefs.remote === 'preferred') {
      if (remote === 'fully') return 1.0;
      if (remote === 'hybrid') return 0.7;
    }

    // Check city match
    for (const city of profile.location_prefs.cities) {
      if (postingLocation.includes(city.toLowerCase())) return 1.0;
    }

    return 0.5;
  }

  private computeCompMatch(jobData: Record<string, unknown>, profile: Profile): number {
    const compRange = jobData.comp_range as { min?: number; max?: number } | null;
    if (!compRange || !compRange.min || !compRange.max) return 0.7; // Unknown = neutral

    const { min: profileMin, preferred } = profile.comp_band;
    if (compRange.max < profileMin) return 0.0;
    if (compRange.min >= preferred) return 1.0;
    if (compRange.max >= preferred) return 0.9;
    if (compRange.max >= profileMin) return 0.6;
    return 0.3;
  }

  estimateTime(_input: AgentInput): number {
    return 15_000;
  }
}
