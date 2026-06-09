import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import runsRoutes from './routes/runs';
import draftsRoutes from './routes/drafts';
import activityRoutes from './routes/activity';
import uiRoutes from './routes/ui';
import gmailAuthRoutes from './routes/gmail-auth';
import analyticsRoutes from './routes/analytics';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/runs', runsRoutes);
app.use('/drafts', draftsRoutes);
app.use('/activity', activityRoutes);
app.use('/dashboard', uiRoutes);
app.use('/ui', uiRoutes);
app.use('/auth', gmailAuthRoutes);
app.use('/analytics', analyticsRoutes);

// Health check
app.get('/health', async (_req, res) => {
  try {
    const { getPool } = await import('@jobagent/shared/src/db/client');
    const { getRedis } = await import('@jobagent/shared/src/redis/client');

    const pool = getPool();
    const redis = getRedis();

    const [dbCheck, redisCheck, stuckCheck] = await Promise.allSettled([
      pool.query('SELECT 1'),
      redis.ping(),
      pool.query(
        `SELECT COUNT(*)::int as count FROM runs WHERE state = 'agent_running' AND started_at < now() - interval '1 hour'`,
      ),
    ]);

    const dbOk = dbCheck.status === 'fulfilled';
    const redisOk = redisCheck.status === 'fulfilled';
    const stuckCount =
      stuckCheck.status === 'fulfilled'
        ? (stuckCheck.value as unknown as { rows: { count: number }[] }).rows[0]?.count || 0
        : -1;

    const overall = dbOk && redisOk;
    res.status(overall ? 200 : 503).json({
      status: overall ? 'ok' : 'degraded',
      service: 'jobagent-api',
      checks: {
        database: dbOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
        stuck_runs_last_hour: stuckCount,
      },
    });
  } catch {
    res.status(503).json({ status: 'error', service: 'jobagent-api' });
  }
});

app.listen(PORT, () => {
  console.log(`JobAgent API listening on port ${PORT}`);
});

export default app;
