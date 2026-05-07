import { getPool } from './packages/shared/src/db/client';

async function checkStatus() {
  const pool = getPool();
  console.log('--- Checking Runs ---');
  const { rows: runs } = await pool.query('SELECT * FROM runs ORDER BY started_at DESC LIMIT 5');
  console.table(runs);

  console.log('\n--- Checking Step Outputs ---');
  const { rows: outputs } = await pool.query('SELECT run_id, step_name, agent_name FROM step_outputs ORDER BY created_at DESC LIMIT 5');
  console.table(outputs);
  
  await pool.end();
}

checkStatus().catch(console.error);
