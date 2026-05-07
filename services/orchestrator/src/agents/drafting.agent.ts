import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbDrafts, dbPostings, dbProfiles } from '@jobagent/shared/src/index';
import { generateResumeVariant } from './resume-selector'; // Placeholder for variant selection logic
import { generateCoverLetter } from './cover-letter-gen'; // Placeholder
import { answerScreeningQuestions } from './screening-gen'; // Placeholder
import { qualityCheck } from './quality-check'; // Placeholder

export default class DraftingAgent implements JobAgent {
  name = 'DraftingAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const draftIds = (input.config.draftIds as string[]) || [];
    const results = { total_drafted: 0, total_flagged: 0, total_failed: 0 };

    // Process drafts
    const tasks = draftIds.map(async (draftId) => {
      try {
        const draft = await dbDrafts.findById(draftId);
        if (!draft) throw new Error(`Draft ${draftId} not found`);

        const posting = await dbPostings.findById(draft.posting_id);
        if (!posting) throw new Error(`Posting for draft ${draftId} not found`);

        // 1. Resume selection
        const variantId = await generateResumeVariant(draft, posting);
        
        // 2. Cover Letter
        const coverLetter = await generateCoverLetter(draft, posting);

        // 3. Screening Answers
        const screeningAnswers = await answerScreeningQuestions(draft, posting);

        // 4. Quality Check
        const qualityReport = await qualityCheck(coverLetter);

        // Update draft
        await dbDrafts.update(draftId, {
            resume_variant_id: variantId,
            cover_letter: coverLetter,
            screening_answers: screeningAnswers,
            status: qualityReport.passed ? 'pending_review' : 'manual_required'
        });

        results.total_drafted++;
      } catch (err) {
        console.error(`[DraftingAgent] Failed draft ${draftId}:`, err);
        results.total_failed++;
        await dbDrafts.update(draftId, { status: 'manual_required' });
      }
    });

    await Promise.allSettled(tasks);

    return {
      data: results,
      metadata: { execution_time_ms: 0 },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 60000;
  }
}
