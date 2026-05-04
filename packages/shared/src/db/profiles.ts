import { getPool } from './client';
import { Profile } from '../interfaces/profile';

interface ProfileRow {
  id: string;
  user_id: string;
  data: Profile;
  updated_at: Date;
}

export async function findByUserId(userId: string): Promise<ProfileRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<ProfileRow>(
    'SELECT id, user_id, data, updated_at FROM profiles WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
}

export async function upsert(userId: string, data: Profile): Promise<ProfileRow> {
  const pool = getPool();
  const { rows } = await pool.query<ProfileRow>(
    `INSERT INTO profiles (user_id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = now()
     RETURNING id, user_id, data, updated_at`,
    [userId, JSON.stringify(data)]
  );
  return rows[0];
}

export async function update(userId: string, partial: Partial<Profile>): Promise<ProfileRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<ProfileRow>(
    `UPDATE profiles SET data = data || $2::jsonb, updated_at = now()
     WHERE user_id = $1
     RETURNING id, user_id, data, updated_at`,
    [userId, JSON.stringify(partial)]
  );
  return rows[0] || null;
}
