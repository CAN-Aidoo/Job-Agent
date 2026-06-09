import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getPool } from '@jobagent/shared/src/db/client';
import crypto from 'crypto';

const router = Router();

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/gmail/callback';
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'change-me-32-byte-key-here-xxxxx';

function encrypt(text: string): string {
  const key = crypto.scryptSync(TOKEN_ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const key = crypto.scryptSync(TOKEN_ENCRYPTION_KEY, 'salt', 32);
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getOAuth2Client() {
  return new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, REDIRECT_URI);
}

// GET /auth/gmail — redirect to Google consent
router.get('/gmail', authMiddleware, (req: AuthRequest, res: Response) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar'],
    state: req.user!.userId,
  });
  res.redirect(url);
});

// GET /auth/gmail/callback — exchange code for tokens
router.get('/gmail/callback', async (req: Request, res: Response) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) {
    res.status(400).json({ error: 'Missing code or state' });
    return;
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code as string);

  const pool = getPool();
  const encryptedAccess = tokens.access_token ? encrypt(tokens.access_token) : null;
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  await pool.query(
    `
    INSERT INTO user_tokens (user_id, provider, access_token, refresh_token, expires_at)
    VALUES ($1, 'google', $2, $3, $4)
    ON CONFLICT (user_id, provider) DO UPDATE SET
      access_token = $2, refresh_token = COALESCE($3, user_tokens.refresh_token), expires_at = $4
  `,
    [userId, encryptedAccess, encryptedRefresh, tokens.expiry_date ? new Date(tokens.expiry_date) : null],
  );

  res.send('<h1>Gmail connected! You can close this window.</h1>');
});

export { decrypt, getOAuth2Client };
export default router;
