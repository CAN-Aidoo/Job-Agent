import { nightlyDiscoveryQueue, morningDeliveryQueue } from './index';

/**
 * Sets up repeatable jobs for the nightly discovery (2 AM) and morning delivery (7 AM).
 * BullMQ's repeat uses cron patterns. Timezone is configurable per user,
 * but for now defaults to UTC. Multi-user scheduling would enqueue per-user jobs.
 */
export async function setupScheduledJobs(): Promise<void> {
  // Nightly discovery at 2:00 AM UTC
  await nightlyDiscoveryQueue.upsertJobScheduler(
    'nightly-discovery-scheduler',
    {
      pattern: '0 2 * * *',
    },
    {
      name: 'nightly-discovery',
      data: { trigger: 'scheduled' },
    }
  );
  console.log('[scheduler] Nightly discovery scheduled at 0 2 * * * UTC');

  // Morning delivery at 7:00 AM UTC
  await morningDeliveryQueue.upsertJobScheduler(
    'morning-delivery-scheduler',
    {
      pattern: '0 7 * * *',
    },
    {
      name: 'morning-delivery',
      data: { trigger: 'scheduled' },
    }
  );
  console.log('[scheduler] Morning delivery scheduled at 0 7 * * * UTC');
}
