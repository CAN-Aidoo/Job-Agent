import { getPool } from '@jobagent/shared/src/db/client';
import { AgentOutput, AgentMetadata } from '@jobagent/shared/src/interfaces/agent';

export interface StepOutput {
  id: string;
  run_id: string;
  step_name: string;
  agent_name: string;
  output_data: unknown;
  metadata: AgentMetadata;
  created_at: Date;
}

export async function saveOutput(
  runId: string,
  stepName: string,
  agentName: string,
  outputData: unknown,
  metadata: AgentMetadata
): Promise<StepOutput> {
  const pool = getPool();
  const { rows } = await pool.query<StepOutput>(
    `INSERT INTO step_outputs (run_id, step_name, agent_name, output_data, metadata)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (run_id, step_name) DO UPDATE SET
       output_data = $4, metadata = $5
     RETURNING *`,
    [runId, stepName, agentName, JSON.stringify(outputData), JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function getOutput(runId: string, stepName: string): Promise<StepOutput | null> {
  const pool = getPool();
  const { rows } = await pool.query<StepOutput>(
    'SELECT * FROM step_outputs WHERE run_id = $1 AND step_name = $2',
    [runId, stepName]
  );
  return rows[0] || null;
}

export async function getAllOutputs(runId: string): Promise<Map<string, AgentOutput>> {
  const pool = getPool();
  const { rows } = await pool.query<StepOutput>(
    'SELECT * FROM step_outputs WHERE run_id = $1 ORDER BY created_at ASC',
    [runId]
  );

  const map = new Map<string, AgentOutput>();
  for (const row of rows) {
    map.set(row.step_name, {
      data: row.output_data,
      metadata: row.metadata,
    });
  }
  return map;
}
