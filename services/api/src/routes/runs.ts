import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { dbRuns } from '@jobagent/shared/src/index';
import { RunPhase, RunState } from '@jobagent/shared/src/interfaces/run';

const router = Router();
router.use(authMiddleware);

// POST /runs/nightly — trigger a nightly discovery run
router.post('/nightly', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const today = new Date().toISOString().split('T')[0];

  try {
    const run = await dbRuns.create(userId, today, RunPhase.NIGHTLY);
    // In production, this would enqueue to BullMQ nightly-discovery queue
    res.status(201).json(run);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(409).json({ error: 'A nightly run already exists for today' });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// GET /runs — all runs for user
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const runs = await dbRuns.findByUser(userId);
  res.json(runs);
});

// GET /runs/:id — full run record
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const run = await dbRuns.findById(req.params.id as string);
  if (!run || run.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(run);
});

// POST /runs/:id/cancel — cancel a run
router.post('/:id/cancel', async (req: AuthRequest, res: Response) => {
  const run = await dbRuns.findById(req.params.id as string);
  if (!run || run.user_id !== req.user!.userId) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (run.state !== RunState.READY && run.state !== RunState.AWAITING_APPROVAL) {
    res.status(400).json({ error: `Cannot cancel a run in state "${run.state}"` });
    return;
  }

  const updated = await dbRuns.update(run.id, { state: RunState.FAILED });
  res.json(updated);
});

export default router;
