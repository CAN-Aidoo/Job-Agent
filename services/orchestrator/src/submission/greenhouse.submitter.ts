import { SubmissionStrategy, SubmissionResult } from './strategy';
import { ApplicationDraft, JobPosting } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';

export class GreenhouseSubmitter implements SubmissionStrategy {
  async execute(draft: ApplicationDraft, _posting: JobPosting, _profile: Profile): Promise<SubmissionResult> {
    console.log(`[GreenhouseSubmitter] Submitting draft ${draft.id}`);
    return { success: true, receipt: { id: 'greenhouse-id-123' } };
  }
}
