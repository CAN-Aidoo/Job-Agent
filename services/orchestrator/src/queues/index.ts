import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const nightlyDiscoveryQueue = new Queue('nightly-discovery', { connection });
export const morningDeliveryQueue = new Queue('morning-delivery', { connection });
export const submissionProcessorQueue = new Queue('submission-processor', { connection });

export { connection };
