import { getPool } from './client';
import { ApplicationDraft, DraftStatus, MatchBreakdown, ScreeningAnswer } from '../interfaces/job';

interface DraftRow {
  id: string;
  user_id: string;
  posting_id: string;
  match_score: number;
  match_breakdown: MatchBreakdown | null;
  resume_variant_id: string | null;
  cover_letter: string | null;
  screening_answers: ScreeningAnswer[] | null;
  status: DraftStatus;
  user_feedback: string | null;
  approved_at: Date | null;
  submitted_at: Date | null;
  submission_receipt: Record<string, unknown> | null;
  created_at: Date;
}

export async function findPendingForUser(userId: string): Promise<DraftRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<DraftRow>(
    `SELECT * FROM application_drafts WHERE user_id = $1 AND status = 'pending_review'
     ORDER BY match_score DESC`,
    [userId],
  );
  return rows;
}

export async function findById(id: string): Promise<DraftRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<DraftRow>('SELECT * FROM application_drafts WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function findByUser(userId: string): Promise<DraftRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<DraftRow>(
    'SELECT * FROM application_drafts WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return rows;
}

export async function create(draft: Omit<ApplicationDraft, 'id' | 'created_at'>): Promise<DraftRow> {
  const pool = getPool();
  const { rows } = await pool.query<DraftRow>(
    `INSERT INTO application_drafts
     (user_id, posting_id, match_score, match_breakdown, resume_variant_id, cover_letter, screening_answers, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      draft.user_id,
      draft.posting_id,
      draft.match_score,
      draft.match_breakdown ? JSON.stringify(draft.match_breakdown) : null,
      draft.resume_variant_id || null,
      draft.cover_letter || null,
      draft.screening_answers ? JSON.stringify(draft.screening_answers) : null,
      draft.status,
    ],
  );
  return rows[0];
}

export async function update(id: string, partial: Partial<DraftRow>): Promise<DraftRow | null> {
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (partial.status !== undefined) {
    sets.push(`status = $${idx++}`);
    values.push(partial.status);
  }
  if (partial.cover_letter !== undefined) {
    sets.push(`cover_letter = $${idx++}`);
    values.push(partial.cover_letter);
  }
  if (partial.screening_answers !== undefined) {
    sets.push(`screening_answers = $${idx++}`);
    values.push(JSON.stringify(partial.screening_answers));
  }
  if (partial.resume_variant_id !== undefined) {
    sets.push(`resume_variant_id = $${idx++}`);
    values.push(partial.resume_variant_id);
  }
  if (partial.user_feedback !== undefined) {
    sets.push(`user_feedback = $${idx++}`);
    values.push(partial.user_feedback);
  }
  if (partial.approved_at !== undefined) {
    sets.push(`approved_at = $${idx++}`);
    values.push(partial.approved_at);
  }
  if (partial.submitted_at !== undefined) {
    sets.push(`submitted_at = $${idx++}`);
    values.push(partial.submitted_at);
  }
  if (partial.submission_receipt !== undefined) {
    sets.push(`submission_receipt = $${idx++}`);
    values.push(JSON.stringify(partial.submission_receipt));
  }

  if (sets.length === 0) return findById(id);

  values.push(id);
  const { rows } = await pool.query<DraftRow>(
    `UPDATE application_drafts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

export async function approve(id: string): Promise<DraftRow | null> {
  return update(id, { status: 'approved', approved_at: new Date() } as Partial<DraftRow>);
}

export async function reject(id: string, reason?: string): Promise<DraftRow | null> {
  return update(id, { status: 'rejected', user_feedback: reason || null } as Partial<DraftRow>);
}

export async function findByUserAndPosting(userId: string, postingId: string): Promise<DraftRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<DraftRow>(
    'SELECT * FROM application_drafts WHERE user_id = $1 AND posting_id = $2',
    [userId, postingId],
  );
  return rows[0] || null;
}
