import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';

export default class DedupAgent implements JobAgent {
  name = 'DedupAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const pool = getPool();
    // Assuming DedupAgent runs after DiscoveryAgent and takes discovery output IDs
    const discoveryOutput = input.previousOutputs.get('DiscoveryAgent');
    const postingIds = (discoveryOutput?.data as { ids: string[] })?.ids || [];

    if (postingIds.length === 0) {
      return { data: { total_input: 0, total_unique: 0, total_merged: 0 }, metadata: { execution_time_ms: 0 } };
    }

    // Logic: find duplicates based on canonical_key and pg_trgm similarity.
    // 1. Get postings for the current run
    const { rows: postings } = await pool.query<{ id: string; canonical_key: string; company: string; role_title: string; location: string; description_md: string; apply_method: string; }>(`
      SELECT id, canonical_key, company, role_title, data->>'location' as location, data->>'description_md' as description_md, data->>'apply_method' as apply_method
      FROM job_postings
      WHERE id = ANY($1)
    `, [postingIds]);

    const startTime = Date.now();
    const uniqueMap = new Map<string, typeof postings[0]>();
    const mergedIds: string[] = [];

    for (const posting of postings) {
      // Simplistic deduplication: use canonical_key
      const existing = uniqueMap.get(posting.canonical_key);
      if (existing) {
        // Simple heuristic: keep the one with a more formal apply_method
        if (posting.apply_method !== 'external' && existing.apply_method === 'external') {
          uniqueMap.set(posting.canonical_key, posting);
          // Mark old one as duplicate
          await pool.query('UPDATE job_postings SET canonical_posting_id = $1 WHERE id = $2', [posting.id, existing.id]);
        } else {
          // Mark current as duplicate
          await pool.query('UPDATE job_postings SET canonical_posting_id = $1 WHERE id = $2', [existing.id, posting.id]);
        }
      } else {
        uniqueMap.set(posting.canonical_key, posting);
      }
    }

    const uniquePostingIds = Array.from(uniqueMap.values()).map(p => p.id);

    return {
      data: {
        total_input: postingIds.length,
        total_unique: uniquePostingIds.length,
        total_merged: postingIds.length - uniquePostingIds.length,
        unique_posting_ids: uniquePostingIds,
      },
      metadata: {
        execution_time_ms: Date.now() - startTime,
      },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 10000;
  }
}
