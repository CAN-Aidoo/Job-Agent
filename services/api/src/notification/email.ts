import nodemailer from 'nodemailer';
import { getPool } from '@jobagent/shared/src/db/client';

interface DigestItem {
  draft_id: string;
  company: string;
  company_logo_url: string;
  role_title: string;
  match_score_pct: number;
  score_reason: string;
  job_summary: string;
  cover_letter_preview: string;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

export async function sendDigestEmail(
  userId: string,
  items: DigestItem[],
  baseUrl: string = process.env.APP_URL || 'http://localhost:3000'
): Promise<void> {
  const pool = getPool();
  const { rows: [user] } = await pool.query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );

  if (!user) return;

  const itemsHtml = items.map(item => `
    <div style="border:1px solid #e0e0e0; border-radius:8px; padding:16px; margin-bottom:12px;">
      <div style="display:flex; align-items:center; margin-bottom:8px;">
        <img src="${item.company_logo_url}" width="32" height="32" style="border-radius:4px; margin-right:8px;" alt="${item.company}" />
        <div>
          <strong>${item.role_title}</strong><br/>
          <span style="color:#666;">${item.company}</span>
        </div>
        <span style="margin-left:auto; font-size:20px; font-weight:bold; color:#2563eb;">${item.match_score_pct}%</span>
      </div>
      <p style="color:#666; font-size:14px; margin:4px 0;">${item.score_reason} &middot; ${item.job_summary.slice(0, 80)}</p>
      <p style="font-size:13px; color:#888;">${item.cover_letter_preview}...</p>
      <div style="margin-top:12px;">
        <a href="${baseUrl}/drafts/${item.draft_id}/approve" style="background:#22c55e; color:white; padding:8px 16px; border-radius:4px; text-decoration:none; margin-right:8px;">Approve</a>
        <a href="${baseUrl}/drafts/${item.draft_id}" style="background:#3b82f6; color:white; padding:8px 16px; border-radius:4px; text-decoration:none; margin-right:8px;">Edit</a>
        <a href="${baseUrl}/drafts/${item.draft_id}/reject" style="background:#ef4444; color:white; padding:8px 16px; border-radius:4px; text-decoration:none;">Reject</a>
      </div>
    </div>
  `).join('');

  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'jobagent@localhost',
    to: user.email,
    subject: `JobAgent: ${items.length} new matches ready for review`,
    html: `
      <div style="font-family:system-ui; max-width:600px; margin:0 auto;">
        <h2 style="color:#1f2937;">Your Morning Job Digest</h2>
        <p style="color:#6b7280;">${items.length} jobs matched your profile. Review and approve in one tap.</p>
        ${itemsHtml}
        <p style="color:#9ca3af; font-size:12px; margin-top:24px;">
          <a href="${baseUrl}/dashboard">View all in dashboard</a>
        </p>
      </div>
    `,
  });
}
