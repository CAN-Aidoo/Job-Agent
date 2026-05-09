import { dbRuns } from '../packages/shared/src/index';
import { RunPhase } from '../packages/shared/src/interfaces/run';
import { processRunToCompletion } from '../services/orchestrator/src/orchestrator/core';

async function runTest() {
  // Use a real user ID from the DB or create one if needed
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  
  console.log('Creating test run...');
  const run = await dbRuns.create(
    userId,
    new Date().toISOString().split('T')[0],
    RunPhase.NIGHTLY
  );
  
  console.log('Processing run', run.id);
  await processRunToCompletion(run.id);
  console.log('Run complete');
}

runTest().catch(console.error);
