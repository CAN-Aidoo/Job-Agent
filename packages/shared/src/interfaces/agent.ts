export interface AgentInput {
  runId: string;
  userId: string;
  config: Record<string, unknown>;
  previousOutputs: Map<string, AgentOutput>;
}

export interface AgentOutput {
  data: unknown;
  metadata: AgentMetadata;
}

export interface AgentMetadata {
  tokens_used?: number;
  model_used?: string;
  execution_time_ms: number;
  errors?: string[];
  [key: string]: unknown;
}

export interface JobAgent {
  name: string;
  execute(input: AgentInput): Promise<AgentOutput>;
  estimateTime(input: AgentInput): number;
}
