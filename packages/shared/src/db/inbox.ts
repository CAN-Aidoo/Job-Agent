import { getPool } from './client';
import { InboxEvent, InboxClassification } from '../interfaces/job';

interface InboxEventRow {
  id: string;
  user_id: string;
  email_id: string;
  classified_as: InboxClassification | null;
  related_draft_id: string | null;
  parsed_data: Record<string, unknown> | null;
  raw_subject: string | null;
  raw_from: string | null;
  received_at: Date;
  created_at: Date;
}

export async function create(event: Omit<InboxEvent, 'id' | 'created_at'>): Promise<InboxEventRow> {
  const pool = getPool();
  const { rows } = await pool.query<InboxEventRow>(
    `INSERT INTO inbox_events (user_id, email_id, classified_as, related_draft_id, parsed_data, raw_subject, raw_from, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      event.user_id,
      event.email_id,
      event.classified_as || null,
      event.related_draft_id || null,
      event.parsed_data ? JSON.stringify(event.parsed_data) : null,
      event.raw_subject || null,
      event.raw_from || null,
      event.received_at,
    ]
  );
  return rows[0];
}

export async function findByEmailId(emailId: string): Promise<InboxEventRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<InboxEventRow>(
    'SELECT * FROM inbox_events WHERE email_id = $1',
    [emailId]
  );
  return rows[0] || null;
}

export async function updateClassification(
  id: string,
  classifiedAs: InboxClassification,
  parsedData: Record<string, unknown>,
  relatedDraftId?: string
): Promise<InboxEventRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<InboxEventRow>(
    `UPDATE inbox_events SET classified_as = $1, parsed_data = $2, related_draft_id = $3
     WHERE id = $4 RETURNING *`,
    [classifiedAs, JSON.stringify(parsedData), relatedDraftId || null, id]
  );
  return rows[0] || null;
}
