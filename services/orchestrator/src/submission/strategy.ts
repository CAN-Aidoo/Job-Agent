import { Profile } from '@jobagent/shared/src/interfaces/profile';

export interface SubmissionResult {
  success: boolean;
  receipt?: Record<string, unknown>;
  error?: string;
}

export interface SubmissionStrategy {
  name: string;
  execute(
    draft: { cover_letter: string; screening_answers: unknown; resume_variant_id: string | null },
    posting: Record<string, unknown>,
    profile: Profile
  ): Promise<SubmissionResult>;
}
