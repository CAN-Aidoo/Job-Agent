import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { JobSource } from '@jobagent/shared/src/interfaces/source';
import { JobPosting } from '@jobagent/shared/src/interfaces/job';
import { dbPostings, dbProfiles } from '@jobagent/shared/src/index';

// Sources will be registered here
const sources: JobSource[] = [];

export function registerSource(source: JobSource): void {
  sources.push(source);
}

export function getSources(): JobSource[] {
  return sources;
}

export default class DiscoveryAgent implements JobAgent {
  name = 'DiscoveryAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const config = input.config as {
      lookback_hours?: number;
      max_per_source?: number;
      sources?: string[];
    };

    const lookbackHours = config.lookback_hours || 24;
    const maxPerSource = config.max_per_source || 100;

    // Load profile
    const profileRow = await dbProfiles.findByUserId(input.userId);
    if (!profileRow) {
      return {
        data: { error: 'No profile found', total_upserted: 0 },
        metadata: { execution_time_ms: Date.now() - startTime, errors: ['No profile found'] },
      };
    }

    const profile = profileRow.data;
    const activeSources = config.sources
      ? sources.filter(s => config.sources!.includes(s.name))
      : sources;

    // Fetch from all sources in parallel
    const results = await Promise.allSettled(
      activeSources.map(async (source) => {
        try {
          const rawPostings = await source.fetchJobs(profile, lookbackHours, maxPerSource);
          const normalized: JobPosting[] = rawPostings.map(raw => source.normalizePosting(raw));
          return { source: source.name, postings: normalized, error: null };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[discovery] Source "${source.name}" failed:`, message);
          return { source: source.name, postings: [] as JobPosting[], error: message };
        }
      })
    );

    // Collect all postings
    const allPostings: JobPosting[] = [];
    const perSource: Record<string, { found: number; error: string | null }> = {};
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { source, postings, error } = result.value;
        allPostings.push(...postings);
        perSource[source] = { found: postings.length, error };
        if (error) errors.push(`${source}: ${error}`);
      } else {
        errors.push(`Unknown source failure: ${result.reason}`);
      }
    }

    // Upsert to database
    const upsertedIds = await dbPostings.bulkUpsert(allPostings);

    return {
      data: {
        total_found: allPostings.length,
        total_upserted: upsertedIds.length,
        per_source: perSource,
        posting_ids: upsertedIds,
      },
      metadata: {
        execution_time_ms: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 30_000; // ~30 seconds for source fetching
  }
}
