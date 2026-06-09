import { SubmissionStrategy, SubmissionResult } from './strategy';
import { ApplicationDraft, JobPosting } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';

export class PlaywrightSubmitter implements SubmissionStrategy {
  async execute(draft: ApplicationDraft, posting: JobPosting, _profile: Profile): Promise<SubmissionResult> {
    console.log(`[PlaywrightSubmitter] Submitting draft ${draft.id} via ${posting.apply_url}`);
    // Real implementation would use Playwright to fill forms
    return { success: true, receipt: { screenshot: 'path/to/screenshot.png' } };
  }
}
