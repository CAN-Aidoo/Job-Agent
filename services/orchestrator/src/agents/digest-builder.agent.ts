import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import { dbDrafts } from '@jobagent/shared/src/index';

export interface DigestItem {
  draft_id: string;
  company: string;
  company_logo_url: string;
  role_title: string;
  match_score_pct: number;
  score_reason: string;
  job_summary: string;
  cover_letter_preview: string;
  needs_review_questions: string[];
}

export default class DigestBuilderAgent implements JobAgent {
  name = 'DigestBuilder';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Get pending drafts for this user
    const drafts = await dbDrafts.findPendingForUser(input.userId);

    const items: DigestItem[] = [];

    for (const draft of drafts) {
      // Fetch the posting
      const { rows: [posting] } = await pool.query<{
        company: string; role_title: string; data: Record<string, unknown>;
      }>('SELECT company, role_title, data FROM job_postings WHERE id = $1', [draft.posting_id]);

      if (!posting) continue;

      const jobData = posting.data as Record<string, unknown>;
      const description = (jobData.description_md as string) || '';
      const companyDomain = (jobData.company_domain as string) || `${posting.company.toLowerCase().replace(/\s+/g, '')}.com`;

      // Determine top scoring criterion
      const breakdown = draft.match_breakdown || {};
      const topCriterion = Object.entries(breakdown)
        .sort(([, a], [, b]) => (b as number) - (a as number))[0];
      const scoreReason = topCriterion ? this.criterionToReason(topCriterion[0]) : 'Good overall fit';

      // Find screening questions needing review
      const needsReview: string[] = [];
      if (draft.screening_answers && Array.isArray(draft.screening_answers)) {
        for (const answer of draft.screening_answers as Array<{ question: string; needs_review: boolean }>) {
          if (answer.needs_review) needsReview.push(answer.question);
        }
      }

      items.push({
        draft_id: draft.id,
        company: posting.company,
        company_logo_url: `https://logo.clearbit.com/${companyDomain}`,
        role_title: posting.role_title,
        match_score_pct: Math.round(draft.match_score * 100),
        score_reason: scoreReason,
        job_summary: description.split('.')[0] || 'No summary available',
        cover_letter_preview: (draft.cover_letter || '').slice(0, 100),
        needs_review_questions: needsReview,
      });
    }

    // Sort by match score
    items.sort((a, b) => b.match_score_pct - a.match_score_pct);

    return {
      data: { digest_items: items, total_items: items.length },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  private criterionToReason(criterion: string): string {
    switch (criterion) {
      case 'role_match': return 'Strong role fit';
      case 'stack_match': return 'Great stack overlap';
      case 'seniority': return 'Right seniority level';
      case 'location': return 'Location match';
      case 'comp': return 'Good comp range';
      case 'company_quality': return 'Quality company';
      default: return 'Good overall fit';
    }
  }

  estimateTime(_input: AgentInput): number {
    return 5_000;
  }
}
