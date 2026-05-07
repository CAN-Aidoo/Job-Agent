import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbDrafts } from '@jobagent/shared/src/index';

export default class DigestBuilderAgent implements JobAgent {
  name = 'DigestBuilderAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const userId = input.userId;
    
    // Get all pending drafts for this user
    const pendingDrafts = await dbDrafts.findPendingForUser(userId);

    const digestItems = pendingDrafts.map(draft => ({
      draft_id: draft.id,
      // For now, these are simplified; real implementation would fetch company details
      company: 'Unknown',
      role: 'Unknown',
      match_score: draft.match_score,
      reason: 'Matches your profile',
    }));

    return {
      data: { digest: digestItems },
      metadata: { execution_time_ms: 0 },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 5000;
  }
}
