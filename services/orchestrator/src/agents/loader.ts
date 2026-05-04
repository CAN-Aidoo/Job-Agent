import * as fs from 'fs';
import * as path from 'path';
import { registry } from './registry';
import { JobAgent } from '@jobagent/shared/src/interfaces/agent';

/**
 * Auto-scans the agents/ directory for files matching *.agent.ts,
 * imports each, instantiates the default export, and registers it.
 */
export async function loadAgents(): Promise<void> {
  const agentsDir = path.resolve(__dirname);
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.ts') || f.endsWith('.agent.js'));

  for (const file of files) {
    const modulePath = path.join(agentsDir, file);
    const mod = await import(modulePath);

    // Support both default export and named 'agent' export
    const AgentClass = mod.default || mod.agent;
    if (!AgentClass) {
      console.warn(`[loader] ${file} has no default export, skipping`);
      continue;
    }

    let agent: JobAgent;
    if (typeof AgentClass === 'function') {
      agent = new AgentClass();
    } else {
      agent = AgentClass as JobAgent;
    }

    if (!agent.name || !agent.execute) {
      console.warn(`[loader] ${file} does not implement JobAgent interface, skipping`);
      continue;
    }

    registry.register(agent);
  }

  console.log(`[loader] Loaded ${registry.listAll().length} agent(s): ${registry.listAll().join(', ')}`);
}
