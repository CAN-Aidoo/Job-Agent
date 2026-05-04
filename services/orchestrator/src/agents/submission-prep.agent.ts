import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';

export default class SubmissionPrepAgent implements JobAgent {
  name = 'SubmissionPrepAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    // Preparation step before submission:
    // - Verify draft is still approved
    // - Verify posting is still active
    // - Download resume PDF if needed
    // For now, just pass through

    return {
      data: { ready: true, draft_id: (input.config as { draft_id?: string }).draft_id },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 2_000;
  }
}
