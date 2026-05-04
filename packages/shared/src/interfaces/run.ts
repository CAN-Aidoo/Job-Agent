export enum RunPhase {
  NIGHTLY = 'nightly',
  MORNING = 'morning',
  SUBMISSION = 'submission',
}

export enum RunState {
  READY = 'ready',
  AGENT_RUNNING = 'agent_running',
  AWAITING_APPROVAL = 'awaiting_approval',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface Run {
  id: string;
  user_id: string;
  run_date: string; // ISO date string YYYY-MM-DD
  phase: RunPhase;
  state: RunState;
  current_step?: string;
  current_step_index: number;
  started_at: Date;
  completed_at?: Date;
}
