import { ApplicationDraft, JobPosting } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';

export interface SubmissionResult {
  success: boolean;
  receipt?: Record<string, unknown>;
  error?: string;
}

export interface SubmissionStrategy {
  execute(draft: ApplicationDraft, posting: JobPosting, profile: Profile): Promise<SubmissionResult>;
}
