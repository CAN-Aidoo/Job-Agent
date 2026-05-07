import { SubmissionStrategy, SubmissionResult } from './strategy';

export class LeverSubmitter implements SubmissionStrategy {
  async execute(draft: any, posting: any, profile: any): Promise<SubmissionResult> {
    console.log(`[LeverSubmitter] Submitting draft ${draft.id}`);
    return { success: true, receipt: { id: 'lever-id-456' } };
  }
}
