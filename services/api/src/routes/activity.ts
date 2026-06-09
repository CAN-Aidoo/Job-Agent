import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getPool } from '@jobagent/shared/src/db/client';

const router = Router();
router.use(authMiddleware);

// GET /activity — last 50 events
router.get('/', async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM activity_log WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.user!.userId],
  );
  res.json(rows);
});

// GET /activity/drafts/:id — events for a specific draft
router.get('/drafts/:id', async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM activity_log WHERE user_id = $1 AND draft_id = $2
     ORDER BY created_at DESC`,
    [req.user!.userId, req.params.id],
  );
  res.json(rows);
});

export default router;
