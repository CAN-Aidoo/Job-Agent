export interface SubmissionResult {
  success: boolean;
  receipt?: Record<string, unknown>;
  error?: string;
}

export interface SubmissionStrategy {
  execute(draft: any, posting: any, profile: any): Promise<SubmissionResult>;
}
