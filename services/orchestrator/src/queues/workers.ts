import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const nightlyWorker = new Worker(
  'nightly-discovery',
  async (job: Job) => {
    console.log(`[nightly-discovery] Processing job ${job.id}:`, job.data);
    // Placeholder — real handler will call orchestrator core
  },
  { connection }
);

export const morningWorker = new Worker(
  'morning-delivery',
  async (job: Job) => {
    console.log(`[morning-delivery] Processing job ${job.id}:`, job.data);
    // Placeholder — real handler will call orchestrator core
  },
  { connection }
);

export const submissionWorker = new Worker(
  'submission-processor',
  async (job: Job) => {
    console.log(`[submission-processor] Processing job ${job.id}:`, job.data);
    // Placeholder — real handler will call orchestrator core
  },
  { connection }
);

nightlyWorker.on('completed', (job) => console.log(`[nightly-discovery] Job ${job.id} completed`));
nightlyWorker.on('failed', (job, err) => console.error(`[nightly-discovery] Job ${job?.id} failed:`, err));

morningWorker.on('completed', (job) => console.log(`[morning-delivery] Job ${job.id} completed`));
morningWorker.on('failed', (job, err) => console.error(`[morning-delivery] Job ${job?.id} failed:`, err));

submissionWorker.on('completed', (job) => console.log(`[submission-processor] Job ${job.id} completed`));
submissionWorker.on('failed', (job, err) => console.error(`[submission-processor] Job ${job?.id} failed:`, err));
