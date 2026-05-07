import { SubmissionStrategy, SubmissionResult } from './strategy';

export class GreenhouseSubmitter implements SubmissionStrategy {
  async execute(draft: any, posting: any, profile: any): Promise<SubmissionResult> {
    console.log(`[GreenhouseSubmitter] Submitting draft ${draft.id}`);
    return { success: true, receipt: { id: 'greenhouse-id-123' } };
  }
}
