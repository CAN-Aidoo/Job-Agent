import { nightlyDiscoveryQueue } from '../queues/index';

async function main(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const job = await nightlyDiscoveryQueue.add('nightly-discovery', {
    run_date: today,
    trigger: 'manual-test',
  });
  console.log(`Enqueued nightly-discovery job: ${job.id} for ${today}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to enqueue test job:', err);
  process.exit(1);
});
