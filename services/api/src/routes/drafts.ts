import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { dbDrafts } from '@jobagent/shared/src/index';
import { getPool } from '@jobagent/shared/src/db/client';

const router = Router();
router.use(authMiddleware);

// GET /drafts — all drafts grouped by status
router.get('/', async (req: AuthRequest, res: Response) => {
  const drafts = await dbDrafts.findByUser(req.user!.userId);
  const grouped = drafts.reduce((acc, d) => {
    const status = d.status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(d);
    return acc;
  }, {} as Record<string, typeof drafts>);
  res.json(grouped);
});

// GET /drafts/:id — full draft
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const draft = await dbDrafts.findById(req.params.id as string);
  if (!draft || draft.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }
  res.json(draft);
});

// POST /drafts/:id/approve
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  const draft = await dbDrafts.findById(req.params.id as string);
  if (!draft || draft.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const updated = await dbDrafts.approve(draft.id);

  // Log activity
  const pool = getPool();
  await pool.query(
    `INSERT INTO activity_log (user_id, draft_id, event_type, details)
     VALUES ($1, $2, 'draft_approved', $3)`,
    [req.user!.userId, draft.id, JSON.stringify({ posting_id: draft.posting_id })]
  );

  res.json(updated);
});

// POST /drafts/:id/reject
router.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  const draft = await dbDrafts.findById(req.params.id as string);
  if (!draft || draft.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const { reason } = req.body;
  const updated = await dbDrafts.reject(draft.id, reason);

  const pool = getPool();
  await pool.query(
    `INSERT INTO activity_log (user_id, draft_id, event_type, details)
     VALUES ($1, $2, 'draft_rejected', $3)`,
    [req.user!.userId, draft.id, JSON.stringify({ reason })]
  );

  res.json(updated);
});

// POST /drafts/:id/edit — edit cover letter or screening answers before approving
router.post('/:id/edit', async (req: AuthRequest, res: Response) => {
  const draft = await dbDrafts.findById(req.params.id as string);
  if (!draft || draft.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const { cover_letter, screening_answers } = req.body;
  const updates: Record<string, unknown> = {};
  if (cover_letter !== undefined) updates.cover_letter = cover_letter;
  if (screening_answers !== undefined) updates.screening_answers = screening_answers;

  const updated = await dbDrafts.update(draft.id, updates as any);
  res.json(updated);
});

// GET /drafts/:id/posting — full posting for context
router.get('/:id/posting', async (req: AuthRequest, res: Response) => {
  const draft = await dbDrafts.findById(req.params.id as string);
  if (!draft || draft.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const pool = getPool();
  const { rows: [posting] } = await pool.query(
    'SELECT * FROM job_postings WHERE id = $1',
    [draft.posting_id]
  );
  res.json(posting || null);
});

export default router;
