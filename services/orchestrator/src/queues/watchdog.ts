import { getPool } from '@jobagent/shared/src/db/client';
import { getRedis } from '@jobagent/shared/src/redis/client';
import { dbRuns } from '@jobagent/shared/src/index';
import { RunState } from '@jobagent/shared/src/interfaces/run';
import { loadPipelineConfig } from '../pipeline/config';

/**
 * Checks for stuck runs and resets them.
 * Should run every 5 minutes via BullMQ repeatable job.
 */
export async function watchdogCheck(): Promise<{ recovered: number; orphaned: number }> {
  const pool = getPool();
  const redis = getRedis();
  const config = loadPipelineConfig();
  const lockTtlMs = config.global.lock_ttl_ms || 300_000;

  // Find runs stuck in agent_running state
  const stuckRuns = await dbRuns.findStuckRuns(lockTtlMs);
  let recovered = 0;

  for (const run of stuckRuns) {
    const lockKey = `run:${run.id}`;
    const lockExists = await redis.get(lockKey);

    if (!lockExists) {
      // Lock expired but state not updated — reset to ready for retry
      await dbRuns.update(run.id, { state: RunState.READY });

      await pool.query(
        `INSERT INTO activity_log (user_id, draft_id, event_type, details) VALUES ($1, NULL, 'retry_attempted', $2)`,
        [run.user_id, JSON.stringify({ run_id: run.id, phase: run.phase, step: run.current_step })]
      );

      console.log(`[watchdog] Recovered stuck run ${run.id} (phase: ${run.phase}, step: ${run.current_step})`);
      recovered++;
    }
  }

  return { recovered, orphaned: 0 };
}
