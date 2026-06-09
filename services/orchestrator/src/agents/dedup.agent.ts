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
    const { rows: postings } = await pool.query<{
      id: string;
      canonical_key: string;
      apply_method: string;
    }>(
      `
      SELECT id, canonical_key, data->>'apply_method' as apply_method
      FROM job_postings
      WHERE id = ANY($1)
    `,
      [postingIds],
    );

    const startTime = Date.now();
    const uniqueMap = new Map<string, (typeof postings)[0]>();

    for (const posting of postings) {
      // Find potential duplicates using similarity on canonical_key
      const { rows: potentialDuplicates } = await pool.query<{ id: string; apply_method: string }>(
        `
        SELECT id, data->>'apply_method' as apply_method
        FROM job_postings
        WHERE id != $1 AND similarity(canonical_key, $2) > 0.92
      `,
        [posting.id, posting.canonical_key],
      );

      let isDuplicate = false;
      for (const dup of potentialDuplicates) {
        // If we found a duplicate, decide which one to keep
        // Heuristic: Prefer API-based apply_method over others
        const currentIsExternal = posting.apply_method === 'external';
        const dupIsExternal = dup.apply_method === 'external';

        if (!currentIsExternal && dupIsExternal) {
          // Keep current, mark existing as duplicate
          await pool.query('UPDATE job_postings SET canonical_posting_id = $1 WHERE id = $2', [posting.id, dup.id]);
        } else {
          // Mark current as duplicate
          await pool.query('UPDATE job_postings SET canonical_posting_id = $1 WHERE id = $2', [dup.id, posting.id]);
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        uniqueMap.set(posting.id, posting);
      }
    }

    const uniquePostingIds = Array.from(uniqueMap.keys());

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
