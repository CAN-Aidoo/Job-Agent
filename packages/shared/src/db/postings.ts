import { getPool } from './client';
import { JobPosting } from '../interfaces/job';

interface PostingRow {
  id: string;
  source: string;
  source_id: string;
  canonical_key: string;
  company: string;
  role_title: string;
  data: Record<string, unknown>;
  authenticity: string | null;
  authenticity_signals: Record<string, unknown> | null;
  discovered_at: Date;
}

export async function findByCanonicalKey(key: string): Promise<PostingRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<PostingRow>(
    'SELECT * FROM job_postings WHERE canonical_key = $1',
    [key]
  );
  return rows;
}

export async function findById(id: string): Promise<PostingRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<PostingRow>(
    'SELECT * FROM job_postings WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function upsert(posting: JobPosting): Promise<string> {
  const pool = getPool();
  const canonicalKey = posting.canonical_key || `${posting.company.toLowerCase()}|${posting.role_title.toLowerCase()}|${posting.location.toLowerCase()}`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO job_postings (source, source_id, canonical_key, company, role_title, data, authenticity, authenticity_signals, discovered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
     ON CONFLICT (source, source_id) DO UPDATE SET
       data = $6, authenticity = COALESCE($7, job_postings.authenticity),
       authenticity_signals = COALESCE($8, job_postings.authenticity_signals)
     RETURNING id`,
    [
      posting.source,
      posting.source_id,
      canonicalKey,
      posting.company,
      posting.role_title,
      JSON.stringify(posting),
      posting.authenticity || null,
      posting.authenticity_signals ? JSON.stringify(posting.authenticity_signals) : null,
      posting.discovered_at || null,
    ]
  );
  return rows[0].id;
}

export async function bulkUpsert(postings: JobPosting[]): Promise<string[]> {
  const ids: string[] = [];
  for (const posting of postings) {
    const id = await upsert(posting);
    ids.push(id);
  }
  return ids;
}
