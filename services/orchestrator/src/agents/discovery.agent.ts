import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbProfiles, dbPostings } from '@jobagent/shared/src/index';
import { JobSource } from '@jobagent/shared/src/interfaces/source';
import { JobPosting } from '@jobagent/shared/src/interfaces/job';
import { sourceRegistry } from '../sources/registry';

// Export registerSource for index.ts
export function registerSource(source: JobSource): void {
  sourceRegistry.register(source);
}

export default class DiscoveryAgent implements JobAgent {
  name = 'DiscoveryAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const profileRow = await dbProfiles.findByUserId(input.userId);
    if (!profileRow) throw new Error(`Profile not found for user ${input.userId}`);
    const profile = profileRow.data;

    const sources = sourceRegistry.getAll();
    const lookbackHours = (input.config.lookbackHours as number) || 24;
    const max = (input.config.max as number) || 100;

    const results = await Promise.allSettled(sources.map((source) => source.fetchJobs(profile, lookbackHours, max)));

    const allNormalized: JobPosting[] = [];
    const summary: Record<string, number> = {};

    results.forEach((res, index) => {
      const source = sources[index];
      if (res.status === 'fulfilled') {
        summary[source.name] = res.value.length;
        res.value.forEach((raw) => {
          try {
            allNormalized.push(source.normalizePosting(raw));
          } catch (e) {
            console.error(`[DiscoveryAgent] Failed to normalize from ${source.name}:`, e);
          }
        });
      } else {
        console.error(`[DiscoveryAgent] Source ${source.name} failed:`, res.reason);
        summary[source.name] = 0;
      }
    });

    const ids = await dbPostings.bulkUpsert(allNormalized);

    return {
      data: { ids },
      metadata: {
        execution_time_ms: 0, // Should be calculated
        summary,
      },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 30000; // 30 seconds
  }
}
