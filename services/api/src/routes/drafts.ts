import { Router, Request, Response } from 'express';
import { dbDrafts } from '@jobagent/shared/src/index';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).send();
  const drafts = await dbDrafts.findPendingForUser(req.user.userId);
  res.json(drafts);
});

router.post('/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  const draftId = req.params.id as string;
  await dbDrafts.approve(draftId);
  res.json({ success: true });
});

router.post('/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  const draftId = req.params.id as string;
  const { reason } = req.body;
  await dbDrafts.reject(draftId, reason);
  res.json({ success: true });
});

export default router;
