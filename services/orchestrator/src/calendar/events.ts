import { google } from 'googleapis';
import { getPool } from '@jobagent/shared/src/db/client';
import crypto from 'crypto';

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'change-me-32-byte-key-here-xxxxx';

function decrypt(encrypted: string): string {
  const key = crypto.scryptSync(TOKEN_ENCRYPTION_KEY, 'salt', 32);
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function createInterviewEvent(
  userId: string,
  inboxEventId: string,
  company: string,
  role: string,
  scheduledAt: Date,
  description: string
): Promise<string | null> {
  const pool = getPool();

  // Get user's Google tokens
  const { rows: [tokenRow] } = await pool.query<{
    access_token: string; refresh_token: string;
  }>(`SELECT access_token, refresh_token FROM user_tokens
      WHERE user_id = $1 AND provider = 'google'`, [userId]);

  if (!tokenRow) {
    console.warn('[calendar] No Google tokens for user', userId);
    return null;
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: decrypt(tokenRow.access_token),
    refresh_token: decrypt(tokenRow.refresh_token),
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const endTime = new Date(scheduledAt.getTime() + 60 * 60 * 1000); // 1 hour duration

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `Interview: ${company} — ${role}`,
      start: { dateTime: scheduledAt.toISOString() },
      end: { dateTime: endTime.toISOString() },
      description,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  });

  const googleEventId = event.data.id || null;

  // Store in database
  await pool.query(
    `INSERT INTO calendar_events (user_id, inbox_event_id, google_event_id, scheduled_at, title)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, inboxEventId, googleEventId, scheduledAt, `Interview: ${company} — ${role}`]
  );

  return googleEventId;
}
