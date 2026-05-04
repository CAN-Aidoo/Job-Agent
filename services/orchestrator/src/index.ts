import { setupScheduledJobs } from './queues/scheduler';
import './queues/workers';
import { registry } from './agents/registry';
import { loadPipelineConfig, validatePipelineAgents } from './pipeline/config';

// Import and register all agents
import DiscoveryAgent from './agents/discovery.agent';
import DedupAgent from './agents/dedup.agent';
import AuthenticityVerifier from './agents/authenticity.agent';
import MatchingAgent from './agents/matching.agent';
import DraftingAgent from './agents/drafting.agent';
import DigestBuilder from './agents/digest-builder.agent';
import DeliveryAgent from './agents/delivery.agent';
import SubmissionPrepAgent from './agents/submission-prep.agent';
import SubmissionAgent from './agents/submission.agent';
import ConfirmationAgent from './agents/confirmation.agent';
import InboxWatcherAgent from './agents/inbox-watcher.agent';
import CalendarSyncAgent from './agents/calendar-sync.agent';

// Register source plugins
import GreenhouseSource from './sources/greenhouse.source';
import LeverSource from './sources/lever.source';
import AshbySource from './sources/ashby.source';
import AdzunaSource from './sources/adzuna.source';
import { registerSource } from './agents/discovery.agent';

async function main(): Promise<void> {
  console.log('JobAgent Orchestrator starting...');

  // Register agents
  registry.register(new DiscoveryAgent());
  registry.register(new DedupAgent());
  registry.register(new AuthenticityVerifier());
  registry.register(new MatchingAgent());
  registry.register(new DraftingAgent());
  registry.register(new DigestBuilder());
  registry.register(new DeliveryAgent());
  registry.register(new SubmissionPrepAgent());
  registry.register(new SubmissionAgent());
  registry.register(new ConfirmationAgent());
  registry.register(new InboxWatcherAgent());
  registry.register(new CalendarSyncAgent());

  console.log(`Registered ${registry.listAll().length} agents: ${registry.listAll().join(', ')}`);

  // Register source plugins
  registerSource(new GreenhouseSource());
  registerSource(new LeverSource());
  registerSource(new AshbySource());
  registerSource(new AdzunaSource());
  console.log('Registered 4 discovery sources');

  // Load and validate pipeline
  const config = loadPipelineConfig();
  validatePipelineAgents(config);
  console.log(`Pipeline loaded: ${Object.keys(config.phases).length} phases`);

  // Set up scheduled jobs
  await setupScheduledJobs();

  console.log('JobAgent Orchestrator running. Workers active.');
}

main().catch((err) => {
  console.error('Failed to start orchestrator:', err);
  process.exit(1);
});
