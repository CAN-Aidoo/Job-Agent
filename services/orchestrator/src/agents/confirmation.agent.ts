import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';

export default class ConfirmationAgent implements JobAgent {
  name = 'ConfirmationAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Get submission output from previous step
    const submissionOutput = input.previousOutputs.get('submit');
    if (!submissionOutput) {
      return {
        data: { confirmed: false, reason: 'No submission output found' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    const submissionData = submissionOutput.data as { success?: boolean; receipt?: Record<string, unknown> };

    if (!submissionData.success) {
      return {
        data: { confirmed: false, reason: 'Submission was not successful' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Log confirmation activity
    const draftId = (input.config as { draft_id?: string }).draft_id;
    if (draftId) {
      await pool.query(
        `INSERT INTO activity_log (user_id, draft_id, event_type, details) VALUES ($1, $2, 'submission_confirmed', $3)`,
        [input.userId, draftId, JSON.stringify(submissionData.receipt)],
      );
    }

    // In production, this would:
    // 1. Poll Gmail API for confirmation email
    // 2. Take screenshot if Playwright was used
    // 3. Send push notification

    return {
      data: { confirmed: true, receipt: submissionData.receipt },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 10_000;
  }
}
