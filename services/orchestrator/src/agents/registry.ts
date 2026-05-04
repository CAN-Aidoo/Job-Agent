import { JobAgent } from '@jobagent/shared/src/interfaces/agent';

export class AgentRegistry {
  private agents: Map<string, JobAgent> = new Map();

  register(agent: JobAgent): void {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent "${agent.name}" is already registered`);
    }
    this.agents.set(agent.name, agent);
    console.log(`[registry] Registered agent: ${agent.name}`);
  }

  get(name: string): JobAgent | undefined {
    return this.agents.get(name);
  }

  listAll(): string[] {
    return Array.from(this.agents.keys());
  }

  has(name: string): boolean {
    return this.agents.has(name);
  }
}

// Singleton
export const registry = new AgentRegistry();
