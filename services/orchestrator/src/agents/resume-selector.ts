import { ApplicationDraft, JobPosting } from '@jobagent/shared/src/interfaces/job';

export async function generateResumeVariant(_draft: ApplicationDraft, _posting: JobPosting): Promise<string> {
  // Placeholder: In real implementation, compare posting embedding vs resume_variant embeddings
  return 'mock-resume-id';
}
