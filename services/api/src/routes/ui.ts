import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { dbDrafts } from '@jobagent/shared/src/index';
import { getPool } from '@jobagent/shared/src/db/client';

const router = Router();
router.use(authMiddleware);

const STYLE = `
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f9fafb; }
  h1 { color: #1f2937; } h2 { color: #374151; margin-top: 24px; }
  .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .score { font-size: 24px; font-weight: bold; color: #2563eb; float: right; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  .status-pending_review, .status-awaiting_approval { background: #fef3c7; color: #92400e; }
  .status-approved { background: #d1fae5; color: #065f46; }
  .status-submitted { background: #dbeafe; color: #1e40af; }
  .status-rejected { background: #fee2e2; color: #991b1b; }
  .btn { padding: 6px 14px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px; color: white; text-decoration: none; display: inline-block; margin-right: 6px; }
  .btn-approve { background: #22c55e; } .btn-reject { background: #ef4444; } .btn-edit { background: #3b82f6; }
  nav { margin-bottom: 24px; } nav a { margin-right: 16px; color: #2563eb; text-decoration: none; }
  textarea { width: 100%; height: 200px; font-family: inherit; padding: 8px; margin-top: 8px; }
</style>
`;

const NAV = `<nav><a href="/dashboard">Dashboard</a><a href="/ui/drafts">All Drafts</a></nav>`;

// GET /dashboard — Today view
router.get('/', async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const userId = req.user!.userId;

  const { rows: pending } = await pool.query(
    `SELECT COUNT(*) as count FROM application_drafts WHERE user_id = $1 AND status IN ('pending_review', 'awaiting_approval')`,
    [userId]
  );
  const { rows: recent } = await pool.query(
    `SELECT event_type, details, created_at FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );

  const activityHtml = recent.map((e: any) =>
    `<div class="card"><strong>${e.event_type}</strong> <span style="color:#666; font-size:12px;">${new Date(e.created_at).toLocaleString()}</span></div>`
  ).join('');

  res.send(`<!DOCTYPE html><html><head><title>JobAgent Dashboard</title>${STYLE}</head><body>
    ${NAV}
    <h1>Dashboard</h1>
    <div class="card"><h2>Pending Approvals: ${pending[0]?.count || 0}</h2></div>
    <h2>Recent Activity</h2>
    ${activityHtml || '<p>No activity yet.</p>'}
  </body></html>`);
});

// GET /ui/drafts — all drafts
router.get('/drafts', async (req: AuthRequest, res: Response) => {
  const drafts = await dbDrafts.findByUser(req.user!.userId);
  const pool = getPool();

  let html = '';
  for (const draft of drafts) {
    const { rows: [posting] } = await pool.query<{ company: string; role_title: string }>(
      'SELECT company, role_title FROM job_postings WHERE id = $1',
      [draft.posting_id]
    );
    html += `<div class="card">
      <span class="score">${Math.round(draft.match_score * 100)}%</span>
      <strong>${posting?.role_title || 'Unknown'}</strong> at ${posting?.company || 'Unknown'}
      <br/><span class="status status-${draft.status}">${draft.status}</span>
      <br/><a href="/ui/drafts/${draft.id}" class="btn btn-edit">View</a>
      ${draft.status === 'awaiting_approval' ? `
        <form method="POST" action="/drafts/${draft.id}/approve" style="display:inline;">
          <button class="btn btn-approve" type="submit">Approve</button>
        </form>
        <form method="POST" action="/drafts/${draft.id}/reject" style="display:inline;">
          <button class="btn btn-reject" type="submit">Reject</button>
        </form>
      ` : ''}
    </div>`;
  }

  res.send(`<!DOCTYPE html><html><head><title>Drafts</title>${STYLE}</head><body>
    ${NAV}
    <h1>All Drafts</h1>
    ${html || '<p>No drafts yet.</p>'}
  </body></html>`);
});

// GET /ui/drafts/:id — single draft view
router.get('/drafts/:id', async (req: AuthRequest, res: Response) => {
  const draft = await dbDrafts.findById(req.params.id as string);
  if (!draft || draft.user_id !== req.user!.userId) {
    res.status(404).send('Not found');
    return;
  }

  const pool = getPool();
  const { rows: [posting] } = await pool.query<{ company: string; role_title: string; data: Record<string, unknown> }>(
    'SELECT company, role_title, data FROM job_postings WHERE id = $1',
    [draft.posting_id]
  );

  const jobData = posting?.data as Record<string, unknown> || {};
  const description = (jobData.description_md as string) || 'No description';

  res.send(`<!DOCTYPE html><html><head><title>Draft: ${posting?.role_title}</title>${STYLE}</head><body>
    ${NAV}
    <h1>${posting?.role_title || 'Unknown'} at ${posting?.company || 'Unknown'}</h1>
    <span class="status status-${draft.status}">${draft.status}</span>
    <span class="score">${Math.round(draft.match_score * 100)}%</span>

    <h2>Job Description</h2>
    <div class="card"><p>${description.slice(0, 2000)}</p></div>

    <h2>Cover Letter</h2>
    <form method="POST" action="/drafts/${draft.id}/edit">
      <textarea name="cover_letter">${draft.cover_letter || ''}</textarea>
      <button class="btn btn-edit" type="submit">Save Edits</button>
    </form>

    <h2>Screening Answers</h2>
    <div class="card"><pre>${JSON.stringify(draft.screening_answers, null, 2)}</pre></div>

    <h2>Actions</h2>
    <form method="POST" action="/drafts/${draft.id}/approve" style="display:inline;">
      <button class="btn btn-approve" type="submit">Approve & Submit</button>
    </form>
    <form method="POST" action="/drafts/${draft.id}/reject" style="display:inline;">
      <button class="btn btn-reject" type="submit">Reject</button>
    </form>
  </body></html>`);
});

export default router;
