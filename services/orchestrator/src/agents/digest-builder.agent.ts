import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbDrafts, dbPostings } from '@jobagent/shared/src/index';

export default class DigestBuilderAgent implements JobAgent {
  name = 'DigestBuilderAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const userId = input.userId;
    
    // Get all pending drafts for this user
    const pendingDrafts = await dbDrafts.findPendingForUser(userId);

    const digestItems = await Promise.all(pendingDrafts.map(async (draft) => {
      const posting = await dbPostings.findById(draft.posting_id);
      
      return {
        draft_id: draft.id,
        company: posting?.company || 'Unknown',
        role: posting?.role_title || 'Unknown',
        match_score: draft.match_score,
        apply_url: posting?.data?.apply_url || '',
        preview: (draft.cover_letter || '').substring(0, 100) + '...',
      };
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
