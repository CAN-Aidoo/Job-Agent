import { v4 as uuidv4 } from 'uuid';
import { dbRuns } from '@jobagent/shared/src/index';
import { RunState } from '@jobagent/shared/src/interfaces/run';
import { AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { acquireLock, releaseLock } from '@jobagent/shared/src/redis/lock';
import { registry } from '../agents/registry';
import { loadPipelineConfig, PipelineStep } from '../pipeline/config';
import { saveOutput, getOutput, getAllOutputs } from './outputs';

const LOCK_TTL_MS = 300_000; // 5 minutes

export async function processRun(runId: string): Promise<void> {
  const instanceId = uuidv4();
  const lockKey = `run:${runId}`;
  const lock = await acquireLock(lockKey, LOCK_TTL_MS, instanceId);

  if (!lock) {
    console.log(`[orchestrator] Could not acquire lock for run ${runId}, skipping`);
    return;
  }

  try {
    const run = await dbRuns.findById(runId);
    if (!run) {
      console.error(`[orchestrator] Run ${runId} not found`);
      return;
    }

    if (run.state === RunState.COMPLETED || run.state === RunState.AWAITING_APPROVAL) {
      console.log(`[orchestrator] Run ${runId} is ${run.state}, nothing to do`);
      return;
    }

    const config = loadPipelineConfig();
    const phase = config.phases[run.phase];
    if (!phase) {
      console.error(`[orchestrator] Phase "${run.phase}" not found in pipeline config`);
      await dbRuns.update(runId, { state: RunState.FAILED });
      return;
    }

    const nextStep: PipelineStep | undefined = phase.steps[run.current_step_index];

    if (!nextStep) {
      // All steps completed
      console.log(`[orchestrator] Run ${runId} completed all steps`);
      await dbRuns.update(runId, { state: RunState.COMPLETED, completed_at: new Date() });
      return;
    }

    // Idempotency check: skip if output already exists
    const existing = await getOutput(runId, nextStep.name);
    if (existing) {
      console.log(`[orchestrator] Step "${nextStep.name}" already has output, advancing`);
      await dbRuns.update(runId, {
        current_step_index: run.current_step_index + 1,
        current_step: nextStep.name,
      });
      return;
    }

    // Resolve agent
    const agent = registry.get(nextStep.agent);
    if (!agent) {
      console.error(`[orchestrator] Agent "${nextStep.agent}" not found for step "${nextStep.name}"`);
      await dbRuns.update(runId, { state: RunState.FAILED });
      return;
    }

    // Build input
    const previousOutputs = await getAllOutputs(runId);
    const input: AgentInput = {
      runId,
      userId: run.user_id,
      config: (nextStep.config || {}) as Record<string, unknown>,
      previousOutputs,
    };

    // Mark as running
    await dbRuns.update(runId, { state: RunState.AGENT_RUNNING, current_step: nextStep.name });
    console.log(`[orchestrator] Executing step "${nextStep.name}" with agent "${nextStep.agent}"`);

    const startTime = Date.now();
    const output: AgentOutput = await agent.execute(input);
    const executionTime = Date.now() - startTime;

    // Store output
    await saveOutput(runId, nextStep.name, nextStep.agent, output.data, {
      ...output.metadata,
      execution_time_ms: executionTime,
    });

    // Advance state
    const newState = nextStep.hitl ? RunState.AWAITING_APPROVAL : RunState.READY;
    await dbRuns.update(runId, {
      state: newState,
      current_step_index: run.current_step_index + 1,
    });

    console.log(`[orchestrator] Step "${nextStep.name}" completed in ${executionTime}ms, state → ${newState}`);
  } catch (err) {
    console.error(`[orchestrator] Error processing run ${runId}:`, err);
    await dbRuns.update(runId, { state: RunState.FAILED }).catch(() => {});
  } finally {
    await releaseLock(lockKey, instanceId);
  }
}

/**
 * Process a run continuously until it completes, hits HITL, or fails.
 */
export async function processRunToCompletion(runId: string): Promise<void> {
  let maxIterations = 20; // Safety limit
  while (maxIterations-- > 0) {
    const run = await dbRuns.findById(runId);
    if (!run) return;

    if (run.state === RunState.COMPLETED || run.state === RunState.AWAITING_APPROVAL || run.state === RunState.FAILED) {
      return;
    }

    await processRun(runId);
  }
}
