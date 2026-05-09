import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbDrafts, sendDigestEmail } from '@jobagent/shared/src/index';

export default class DeliveryAgent implements JobAgent {
  name = 'DeliveryAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const userId = input.userId;
    const digest = input.previousOutputs.get('DigestBuilderAgent')?.data;

    if (!digest) {
        throw new Error('No digest found for delivery');
    }

    // Send notification
    await sendDigestEmail(userId, digest);

    // Update draft status
    const drafts = await dbDrafts.findPendingForUser(userId);
    for (const draft of drafts) {
        if (draft.id) {
            await dbDrafts.update(draft.id, { status: 'awaiting_approval' });
        }
    }

    return {
      data: { delivered: true },
      metadata: { execution_time_ms: 0 },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 5000;
  }
}
