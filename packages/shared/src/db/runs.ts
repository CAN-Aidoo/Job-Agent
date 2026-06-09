import { getPool } from './client';
import { Run, RunPhase, RunState } from '../interfaces/run';

interface RunRow {
  id: string;
  user_id: string;
  run_date: string;
  phase: RunPhase;
  state: RunState;
  current_step: string | null;
  current_step_index: number;
  started_at: Date;
  completed_at: Date | null;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    user_id: row.user_id,
    run_date: row.run_date,
    phase: row.phase,
    state: row.state,
    current_step: row.current_step || undefined,
    current_step_index: row.current_step_index,
    started_at: row.started_at,
    completed_at: row.completed_at || undefined,
  };
}

export async function findById(id: string): Promise<Run | null> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>('SELECT * FROM runs WHERE id = $1', [id]);
  return rows[0] ? rowToRun(rows[0]) : null;
}

export async function findPendingByPhase(phase: RunPhase, limit: number = 10): Promise<Run[]> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>(
    `SELECT * FROM runs WHERE phase = $1 AND state IN ('ready', 'agent_running')
     ORDER BY started_at ASC LIMIT $2`,
    [phase, limit],
  );
  return rows.map(rowToRun);
}

export async function create(userId: string, runDate: string, phase: RunPhase): Promise<Run> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>(
    `INSERT INTO runs (user_id, run_date, phase, state, current_step_index)
     VALUES ($1, $2, $3, 'ready', 0)
     RETURNING *`,
    [userId, runDate, phase],
  );
  return rowToRun(rows[0]);
}

export async function update(
  id: string,
  partial: Partial<Pick<Run, 'state' | 'current_step' | 'current_step_index' | 'completed_at'>>,
): Promise<Run | null> {
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (partial.state !== undefined) {
    sets.push(`state = $${idx++}`);
    values.push(partial.state);
  }
  if (partial.current_step !== undefined) {
    sets.push(`current_step = $${idx++}`);
    values.push(partial.current_step);
  }
  if (partial.current_step_index !== undefined) {
    sets.push(`current_step_index = $${idx++}`);
    values.push(partial.current_step_index);
  }
  if (partial.completed_at !== undefined) {
    sets.push(`completed_at = $${idx++}`);
    values.push(partial.completed_at);
  }

  if (sets.length === 0) return findById(id);

  values.push(id);
  const { rows } = await pool.query<RunRow>(
    `UPDATE runs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] ? rowToRun(rows[0]) : null;
}

export async function findStuckRuns(thresholdMs: number): Promise<Run[]> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>(
    `SELECT * FROM runs WHERE state = 'agent_running'
     AND started_at < now() - interval '1 millisecond' * $1`,
    [thresholdMs],
  );
  return rows.map(rowToRun);
}

export async function findByUser(userId: string): Promise<Run[]> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>('SELECT * FROM runs WHERE user_id = $1 ORDER BY started_at DESC', [userId]);
  return rows.map(rowToRun);
}
