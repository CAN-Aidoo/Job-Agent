import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import { dbDrafts, dbProfiles } from '@jobagent/shared/src/index';
import { SubmissionStrategy } from '../submission/strategy';
import GreenhouseSubmitter from '../submission/greenhouse.submitter';
import LeverSubmitter from '../submission/lever.submitter';
import PlaywrightSubmitter from '../submission/playwright.submitter';

const strategies: Record<string, SubmissionStrategy> = {
  greenhouse_api: new GreenhouseSubmitter(),
  lever_api: new LeverSubmitter(),
  ashby_api: new LeverSubmitter(), // Ashby uses similar pattern to Lever
  workday_form: new PlaywrightSubmitter(),
  external: new PlaywrightSubmitter(),
};

export default class SubmissionAgent implements JobAgent {
  name = 'SubmissionAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Get the approved draft ID from input config
    const draftId = (input.config as { draft_id?: string }).draft_id;
    if (!draftId) {
      return {
        data: { error: 'No draft_id in config' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    const draft = await dbDrafts.findById(draftId);
    if (!draft) {
      return {
        data: { error: 'Draft not found' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Load posting
    const { rows: [postingRow] } = await pool.query<{ data: Record<string, unknown> }>(
      'SELECT data FROM job_postings WHERE id = $1',
      [draft.posting_id]
    );
    if (!postingRow) {
      return {
        data: { error: 'Posting not found' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Load profile
    const profileRow = await dbProfiles.findByUserId(input.userId);
    if (!profileRow) {
      return {
        data: { error: 'Profile not found' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    const posting = postingRow.data;
    const applyMethod = (posting.apply_method as string) || 'external';

    // Resolve strategy
    const strategy = strategies[applyMethod];
    if (!strategy) {
      // Mark as manual_required
      await dbDrafts.update(draftId, { status: 'manual_required' } as any);
      return {
        data: { status: 'manual_required', reason: `No strategy for: ${applyMethod}` },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Execute submission
    const result = await strategy.execute(
      {
        cover_letter: draft.cover_letter || '',
        screening_answers: draft.screening_answers,
        resume_variant_id: draft.resume_variant_id,
      },
      posting,
      profileRow.data
    );

    if (result.success) {
      await dbDrafts.update(draftId, {
        status: 'submitted',
        submitted_at: new Date(),
        submission_receipt: result.receipt || {},
      } as any);

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, draft_id, event_type, details) VALUES ($1, $2, 'submission_succeeded', $3)`,
        [input.userId, draftId, JSON.stringify(result.receipt)]
      );
    } else if (result.error === 'manual_required') {
      await dbDrafts.update(draftId, {
        status: 'manual_required',
        submission_receipt: result.receipt || {},
      } as any);

      await pool.query(
        `INSERT INTO activity_log (user_id, draft_id, event_type, details) VALUES ($1, $2, 'submission_manual_required', $3)`,
        [input.userId, draftId, JSON.stringify({ reason: result.receipt })]
      );
    } else {
      await dbDrafts.update(draftId, {
        status: 'submission_failed',
        submission_receipt: { error: result.error },
      } as any);

      await pool.query(
        `INSERT INTO activity_log (user_id, draft_id, event_type, details) VALUES ($1, $2, 'submission_failed', $3)`,
        [input.userId, draftId, JSON.stringify({ error: result.error })]
      );
    }

    return {
      data: { success: result.success, status: draft.status, receipt: result.receipt },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 30_000;
  }
}
