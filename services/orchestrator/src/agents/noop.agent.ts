import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';

export default class NoopAgent implements JobAgent {
  name = 'NoopAgent';

  async execute(_input: AgentInput): Promise<AgentOutput> {
    return {
      data: {},
      metadata: {
        execution_time_ms: 0,
      },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 0;
  }
}
