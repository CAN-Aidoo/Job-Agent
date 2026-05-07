import { google } from 'googleapis';
import { dbClient } from '@jobagent/shared/src/index';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost:3000/auth/gmail/callback'
);

export async function getGmailClient(userId: string) {
  // 1. Fetch tokens from DB (token encryption key needed)
  // 2. Set tokens on oauth2Client
  // 3. Handle refresh if expired
  return google.gmail({ version: 'v1', auth: oauth2Client });
}
