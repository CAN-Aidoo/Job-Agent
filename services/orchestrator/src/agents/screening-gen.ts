import { ApplicationDraft, JobPosting, ScreeningAnswer } from '@jobagent/shared/src/interfaces/job';

export async function answerScreeningQuestions(
  _draft: ApplicationDraft,
  _posting: JobPosting,
): Promise<ScreeningAnswer[]> {
  // Placeholder: parse screening questions and answer based on profile
  return [{ question: 'Work authorization?', answer: 'Yes', needs_review: false }];
}
