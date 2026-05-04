import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import { dbInbox } from '@jobagent/shared/src/index';
import { InboxClassification } from '@jobagent/shared/src/interfaces/job';
import crypto from 'crypto';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
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

export default class InboxWatcherAgent implements JobAgent {
  name = 'InboxWatcherAgent';
  private anthropic: Anthropic | null = null;

  private getAnthropic(): Anthropic {
    if (!this.anthropic) this.anthropic = new Anthropic();
    return this.anthropic;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Get user's Google tokens
    const { rows: [tokenRow] } = await pool.query<{
      access_token: string; refresh_token: string; expires_at: Date;
    }>(`SELECT access_token, refresh_token, expires_at FROM user_tokens
        WHERE user_id = $1 AND provider = 'google'`, [input.userId]);

    if (!tokenRow) {
      return {
        data: { error: 'No Google tokens found' },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Set up Gmail client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: decrypt(tokenRow.access_token),
      refresh_token: decrypt(tokenRow.refresh_token),
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Fetch messages from last 6 minutes
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    const query = `after:${Math.floor(sixMinAgo.getTime() / 1000)}`;

    const { data: listData } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20,
    });

    const messages = listData.messages || [];
    let classified = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      // Check if already processed
      const existing = await dbInbox.findByEmailId(msg.id);
      if (existing) continue;

      // Fetch full message
      const { data: fullMsg } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = fullMsg.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
      const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value;
      const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

      // Extract body text
      let body = '';
      if (fullMsg.payload?.body?.data) {
        body = Buffer.from(fullMsg.payload.body.data, 'base64').toString();
      } else if (fullMsg.payload?.parts) {
        const textPart = fullMsg.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString();
        }
      }

      // Create inbox event
      const event = await dbInbox.create({
        user_id: input.userId,
        email_id: msg.id,
        classified_as: undefined,
        raw_subject: subject,
        raw_from: from,
        received_at: receivedAt,
      });

      // Classify with LLM
      const classification = await this.classifyEmail(subject, from, body.slice(0, 500));

      await dbInbox.updateClassification(
        event.id,
        classification.classification,
        classification.parsed_data
      );

      classified++;
    }

    return {
      data: { messages_checked: messages.length, classified },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  private async classifyEmail(
    subject: string,
    from: string,
    body: string
  ): Promise<{ classification: InboxClassification; parsed_data: Record<string, unknown> }> {
    const client = this.getAnthropic();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Classify this email. Return JSON only with fields:
- classification: one of "interview_invite", "rejection", "offer", "recruiter_outreach", "application_confirmation", "screening_required", "reference_check", "noise"
- If interview_invite: include date_str, time_str, timezone, format (phone/video/onsite), interviewer_name, company_name
- If rejection: include company_name, role_name

Subject: ${subject}
From: ${from}
Body: ${body}`,
      }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    try {
      const parsed = JSON.parse(text);
      return {
        classification: parsed.classification || 'noise',
        parsed_data: parsed,
      };
    } catch {
      return { classification: 'noise', parsed_data: {} };
    }
  }

  estimateTime(_input: AgentInput): number {
    return 15_000;
  }
}
