import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbDrafts, dbPostings, dbProfiles } from '@jobagent/shared/src/index';
import { SubmissionStrategy } from '../submission/strategy';
import { GreenhouseSubmitter } from '../submission/greenhouse.submitter';
import { LeverSubmitter } from '../submission/lever.submitter';
import { PlaywrightSubmitter } from '../submission/playwright.submitter';

export default class SubmissionAgent implements JobAgent {
  name = 'SubmissionAgent';
  private strategies: Record<string, SubmissionStrategy>;

  constructor() {
    this.strategies = {
      greenhouse_api: new GreenhouseSubmitter(),
      lever_api: new LeverSubmitter(),
      external: new PlaywrightSubmitter(),
    };
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const draftId = input.config.draftId as string;
    const draft = await dbDrafts.findById(draftId);
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    const posting = await dbPostings.findById(draft.posting_id);
    if (!posting) throw new Error(`Posting for draft ${draftId} not found`);

    const profile = await dbProfiles.findByUserId(draft.user_id);
    if (!profile) throw new Error(`Profile for user ${draft.user_id} not found`);

    // Cast data as any to access properties
    const postingData = posting.data as any;
    const strategy = this.strategies[postingData.apply_method as string] || this.strategies['external'];
    
    const result = await strategy.execute(draft, posting, profile);

    if (result.success) {
      await dbDrafts.update(draftId, { status: 'submitted', submission_receipt: result.receipt });
    } else {
      await dbDrafts.update(draftId, { status: 'submission_failed', user_feedback: result.error });
    }

    return {
      data: result,
      metadata: { execution_time_ms: 0 },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 60000;
  }
}
