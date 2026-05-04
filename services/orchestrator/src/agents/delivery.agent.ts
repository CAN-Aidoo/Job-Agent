import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';

export default class DeliveryAgent implements JobAgent {
  name = 'DeliveryAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Transition all pending_review drafts to awaiting_approval
    const { rowCount } = await pool.query(
      `UPDATE application_drafts SET status = 'awaiting_approval'
       WHERE user_id = $1 AND status = 'pending_review'`,
      [input.userId]
    );

    // In production, this would trigger email/push notifications
    // via the notification service. For now, just log it.
    console.log(`[delivery] Delivered digest to user ${input.userId}: ${rowCount} drafts now awaiting approval`);

    return {
      data: { delivered_count: rowCount || 0 },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 5_000;
  }
}
