import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';

export default class DedupAgent implements JobAgent {
  name = 'DedupAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Get discovery output for posting IDs
    const discoveryOutput = input.previousOutputs.get('discovery');
    const postingIds: string[] = discoveryOutput?.data
      ? (discoveryOutput.data as { posting_ids?: string[] }).posting_ids || []
      : [];

    if (postingIds.length === 0) {
      return {
        data: { total_input: 0, total_unique: 0, total_merged: 0 },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    // Find duplicates by canonical_key similarity
    const { rows: duplicates } = await pool.query<{ id: string; canonical_key: string; cnt: number }>(`
      SELECT canonical_key, COUNT(*)::int as cnt
      FROM job_postings
      WHERE id = ANY($1)
      GROUP BY canonical_key
      HAVING COUNT(*) > 1
    `, [postingIds]);

    let totalMerged = 0;

    for (const dup of duplicates) {
      // For each group of duplicates, keep the one with the longest description
      const { rows: group } = await pool.query<{ id: string; data: Record<string, unknown> }>(`
        SELECT id, data FROM job_postings
        WHERE canonical_key = $1 AND id = ANY($2)
        ORDER BY length(data::text) DESC
      `, [dup.canonical_key, postingIds]);

      if (group.length > 1) {
        // Mark duplicates (keep first, it has most data)
        const keepId = group[0].id;
        const removeIds = group.slice(1).map(g => g.id);

        // We don't delete duplicates, but we can mark them
        // For now just count them
        totalMerged += removeIds.length;

        console.log(`[dedup] Canonical key "${dup.canonical_key}": keeping ${keepId}, merged ${removeIds.length} duplicates`);
      }
    }

    // Also check fuzzy duplicates using pg_trgm
    const { rows: fuzzyDups } = await pool.query<{ id1: string; id2: string; sim: number }>(`
      SELECT a.id as id1, b.id as id2, similarity(a.canonical_key, b.canonical_key) as sim
      FROM job_postings a, job_postings b
      WHERE a.id = ANY($1) AND b.id = ANY($1)
        AND a.id < b.id
        AND similarity(a.canonical_key, b.canonical_key) > 0.92
    `, [postingIds]);

    totalMerged += fuzzyDups.length;

    return {
      data: {
        total_input: postingIds.length,
        total_unique: postingIds.length - totalMerged,
        total_merged: totalMerged,
        unique_posting_ids: postingIds, // Pass all IDs forward for now
      },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 5_000;
  }
}
