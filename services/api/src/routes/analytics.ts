import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getPool } from '@jobagent/shared/src/db/client';

const router = Router();
router.use(authMiddleware);

// GET /analytics/overview
router.get('/overview', async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const userId = req.user!.userId;

  const [totalDrafted, totalSubmitted, totalPending, avgScore, topCompanies, weeklyApps, outcomes] =
    await Promise.all([
      pool.query<{ count: number }>('SELECT COUNT(*)::int as count FROM application_drafts WHERE user_id = $1', [userId]),
      pool.query<{ count: number }>(`SELECT COUNT(*)::int as count FROM application_drafts WHERE user_id = $1 AND status = 'submitted'`, [userId]),
      pool.query<{ count: number }>(`SELECT COUNT(*)::int as count FROM application_drafts WHERE user_id = $1 AND status IN ('pending_review', 'awaiting_approval')`, [userId]),
      pool.query<{ avg: number }>('SELECT COALESCE(AVG(match_score), 0)::float as avg FROM application_drafts WHERE user_id = $1', [userId]),
      pool.query<{ company: string; avg_score: number }>(`
        SELECT jp.company, AVG(ad.match_score)::float as avg_score
        FROM application_drafts ad JOIN job_postings jp ON jp.id = ad.posting_id
        WHERE ad.user_id = $1 GROUP BY jp.company ORDER BY avg_score DESC LIMIT 5
      `, [userId]),
      pool.query<{ week: string; count: number }>(`
        SELECT date_trunc('week', created_at)::date::text as week, COUNT(*)::int as count
        FROM application_drafts WHERE user_id = $1 AND created_at > now() - interval '8 weeks'
        GROUP BY week ORDER BY week
      `, [userId]),
      pool.query<{ status: string; count: number }>(`
        SELECT status, COUNT(*)::int as count FROM application_drafts WHERE user_id = $1 GROUP BY status
      `, [userId]),
    ]);

  res.json({
    total_applications_drafted: totalDrafted.rows[0]?.count || 0,
    total_applications_submitted: totalSubmitted.rows[0]?.count || 0,
    total_applications_pending: totalPending.rows[0]?.count || 0,
    avg_match_score: Math.round((avgScore.rows[0]?.avg || 0) * 100) / 100,
    top_matched_companies: topCompanies.rows,
    applications_per_week: weeklyApps.rows,
    outcome_breakdown: outcomes.rows,
  });
});

// GET /analytics/sources
router.get('/sources', async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const userId = req.user!.userId;

  const { rows } = await pool.query<{ source: string; count: number; avg_score: number }>(`
    SELECT jp.source, COUNT(*)::int as count, AVG(ad.match_score)::float as avg_score
    FROM application_drafts ad JOIN job_postings jp ON jp.id = ad.posting_id
    WHERE ad.user_id = $1 GROUP BY jp.source ORDER BY count DESC
  `, [userId]);

  res.json(rows);
});

// GET /analytics/timeline
router.get('/timeline', async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const userId = req.user!.userId;

  const { rows } = await pool.query<{ date: string; status: string; count: number }>(`
    SELECT created_at::date::text as date, status, COUNT(*)::int as count
    FROM application_drafts WHERE user_id = $1 AND created_at > now() - interval '30 days'
    GROUP BY date, status ORDER BY date
  `, [userId]);

  res.json(rows);
});

export default router;
