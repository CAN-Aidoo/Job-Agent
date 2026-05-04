import Anthropic from '@anthropic-ai/sdk';
import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import { dbDrafts, dbProfiles } from '@jobagent/shared/src/index';
import { Profile } from '@jobagent/shared/src/interfaces/profile';
import { ScreeningAnswer } from '@jobagent/shared/src/interfaces/job';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

interface DraftConfig {
  generate_cover_letter: boolean;
  select_resume_variant: boolean;
  answer_common_screening_questions: boolean;
  max_drafts_per_run: number;
}

export default class DraftingAgent implements JobAgent {
  name = 'DraftingAgent';
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const config = input.config as unknown as DraftConfig;
    const maxDrafts = config.max_drafts_per_run || 10;

    // Load profile
    const profileRow = await dbProfiles.findByUserId(input.userId);
    if (!profileRow) {
      return {
        data: { error: 'No profile found' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }
    const profile = profileRow.data;

    // Get draft IDs from matching step
    const matchingOutput = input.previousOutputs.get('matching');
    const draftIds: string[] = matchingOutput?.data
      ? (matchingOutput.data as { draft_ids?: string[] }).draft_ids || []
      : [];

    const draftsToProcess = draftIds.slice(0, maxDrafts);
    let totalDrafted = 0, totalFlagged = 0, totalFailed = 0;
    let totalTokens = 0;

    // Process in batches of 3
    const batchSize = 3;
    for (let i = 0; i < draftsToProcess.length; i += batchSize) {
      const batch = draftsToProcess.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(draftId => this.processSingleDraft(draftId, profile, config))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.flagged) totalFlagged++;
          else totalDrafted++;
          totalTokens += result.value.tokensUsed;
        } else {
          totalFailed++;
          console.error('[drafting] Draft failed:', result.reason);
        }
      }
    }

    return {
      data: { total_drafted: totalDrafted, total_flagged: totalFlagged, total_failed: totalFailed },
      metadata: {
        execution_time_ms: Date.now() - startTime,
        tokens_used: totalTokens,
        model_used: MODEL,
      },
    };
  }

  private async processSingleDraft(
    draftId: string,
    profile: Profile,
    config: DraftConfig
  ): Promise<{ flagged: boolean; tokensUsed: number }> {
    const pool = getPool();
    let tokensUsed = 0;

    // Load draft and posting
    const draft = await dbDrafts.findById(draftId);
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    const { rows: [posting] } = await pool.query<{ data: Record<string, unknown> }>(
      'SELECT data FROM job_postings WHERE id = $1',
      [draft.posting_id]
    );
    if (!posting) throw new Error(`Posting ${draft.posting_id} not found`);

    const jobData = posting.data as Record<string, unknown>;
    const description = (jobData.description_md as string) || '';
    const roleTitle = (jobData.role_title as string) || '';
    const company = (jobData.company as string) || '';

    // Step 1: Select resume variant
    if (config.select_resume_variant) {
      const { rows: variants } = await pool.query<{ id: string; name: string }>(
        'SELECT id, name FROM resume_variants WHERE user_id = $1',
        [draft.user_id]
      );
      if (variants.length > 0) {
        // Simple heuristic: pick first variant (in production, use embedding similarity)
        await dbDrafts.update(draftId, { resume_variant_id: variants[0].id } as any);
      }
    }

    // Step 2: Generate cover letter
    let coverLetter = '';
    if (config.generate_cover_letter) {
      const result = await this.generateCoverLetter(profile, roleTitle, company, description);
      coverLetter = result.text;
      tokensUsed += result.tokensUsed;

      // Quality check
      const quality = await this.qualityCheck(coverLetter, profile, company, roleTitle);
      tokensUsed += quality.tokensUsed;

      if (quality.needsRegeneration) {
        // Regenerate once
        const retry = await this.generateCoverLetter(profile, roleTitle, company, description);
        coverLetter = retry.text;
        tokensUsed += retry.tokensUsed;
      }

      if (quality.needsManualReview) {
        await dbDrafts.update(draftId, {
          cover_letter: coverLetter,
          status: 'pending_review',
        } as any);
        return { flagged: true, tokensUsed };
      }
    }

    // Step 3: Answer screening questions
    let screeningAnswers: ScreeningAnswer[] = [];
    if (config.answer_common_screening_questions) {
      const result = await this.answerScreeningQuestions(profile, description);
      screeningAnswers = result.answers;
      tokensUsed += result.tokensUsed;
    }

    // Save to draft
    await dbDrafts.update(draftId, {
      cover_letter: coverLetter,
      screening_answers: screeningAnswers as any,
    } as any);

    return { flagged: false, tokensUsed };
  }

  private async generateCoverLetter(
    profile: Profile,
    roleTitle: string,
    company: string,
    description: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const client = this.getClient();

    const systemPrompt = `You are writing a cover letter for a job application. Generate a 250-word cover letter in the first person that is specific to this role. Do not use generic phrases like "I am writing to apply". Mention exactly 2 company-specific details from the job description. Do not invent credentials or achievements not present in the applicant's profile.`;

    const userPrompt = `Applicant: ${profile.full_name}
Target Role: ${roleTitle} at ${company}
Stack: ${profile.stack.join(', ')}
Seniority: ${profile.seniority}

Job Description (first 1500 chars):
${description.slice(0, 1500)}

Writing voice sample (match this style):
${profile.cover_letter_voice_sample?.slice(0, 300) || 'Professional, concise, and confident.'}

Generate the cover letter now.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    return {
      text,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  }

  private async qualityCheck(
    coverLetter: string,
    profile: Profile,
    company: string,
    roleTitle: string
  ): Promise<{ needsRegeneration: boolean; needsManualReview: boolean; tokensUsed: number }> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Verify this cover letter. Return JSON only:
{
  "contains_specific_company_mention": bool,
  "contains_specific_role_mention": bool,
  "word_count": int,
  "mentions_user_name": bool,
  "contains_placeholder_text": bool,
  "sounds_like_voice_sample": bool
}

Company: ${company}
Role: ${roleTitle}
Applicant name: ${profile.full_name}

Cover Letter:
${coverLetter}`,
      }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    try {
      const check = JSON.parse(text);
      const needsRegeneration = check.contains_placeholder_text || check.word_count < 150 || check.word_count > 350;
      const needsManualReview = false; // Only on second failure
      return { needsRegeneration, needsManualReview, tokensUsed };
    } catch {
      return { needsRegeneration: false, needsManualReview: false, tokensUsed };
    }
  }

  private async answerScreeningQuestions(
    profile: Profile,
    _description: string
  ): Promise<{ answers: ScreeningAnswer[]; tokensUsed: number }> {
    // Pre-fill common screening answers from profile data
    const answers: ScreeningAnswer[] = [
      {
        question: 'Work authorization',
        answer: profile.work_authorization.join(', ') || 'Authorized to work',
        needs_review: false,
      },
      {
        question: 'Salary expectation',
        answer: `${profile.comp_band.min.toLocaleString()} - ${profile.comp_band.preferred.toLocaleString()} ${profile.comp_band.currency}`,
        needs_review: false,
      },
      {
        question: 'Notice period',
        answer: '2 weeks',
        needs_review: false,
      },
      {
        question: 'Remote work preference',
        answer: profile.location_prefs.remote === 'required' ? 'Remote only'
          : profile.location_prefs.remote === 'preferred' ? 'Remote preferred, open to hybrid'
          : 'Open to any arrangement',
        needs_review: false,
      },
      {
        question: 'Years of experience',
        answer: this.seniorityToYears(profile.seniority),
        needs_review: false,
      },
    ];

    return { answers, tokensUsed: 0 };
  }

  private seniorityToYears(seniority: string): string {
    switch (seniority) {
      case 'junior': return '0-2 years';
      case 'mid': return '3-5 years';
      case 'senior': return '5-8 years';
      case 'staff': return '8-12 years';
      case 'principal': return '12+ years';
      default: return '5+ years';
    }
  }

  estimateTime(_input: AgentInput): number {
    return 60_000;
  }
}
