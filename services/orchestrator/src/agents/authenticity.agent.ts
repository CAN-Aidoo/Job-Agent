import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';

export default class AuthenticityVerifier implements JobAgent {
  name = 'AuthenticityVerifier';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();
    const discoveryOutput = input.previousOutputs.get('DiscoveryAgent');
    const postingIds = (discoveryOutput?.data as { ids: string[] })?.ids || [];

    const stats = { total_processed: postingIds.length, verified: 0, suspicious: 0, scam: 0 };

    for (const id of postingIds) {
      const { rows } = await pool.query<{
        data: {
          description_md?: string;
          raw?: { email?: string };
          company_domain?: string;
          comp_range?: { max: number };
          role_title: string;
        };
      }>('SELECT data FROM job_postings WHERE id = $1', [id]);
      if (rows.length === 0) continue;

      const posting = rows[0].data;
      const desc = ((posting.description_md as string) || '').toLowerCase();
      const email = ((posting.raw?.email as string) || '').toLowerCase();

      let status: 'verified' | 'suspicious' | 'scam' = 'verified';
      const signals: string[] = [];

      // Scam checks
      if (
        desc.includes('wire funds') ||
        desc.includes('upfront fee') ||
        desc.includes('send money') ||
        desc.includes('ssn')
      ) {
        status = 'scam';
        signals.push('contains_scam_keywords');
      }

      // Suspicious checks
      if (
        !posting.company_domain &&
        (email.includes('gmail.com') || email.includes('yahoo.com') || email.includes('outlook.com'))
      ) {
        status = 'suspicious';
        signals.push('generic_email_only');
      }

      if (posting.comp_range && posting.comp_range.max > 300000 && posting.role_title.toLowerCase().includes('entry')) {
        status = 'suspicious';
        signals.push('unrealistic_salary_for_seniority');
      }

      // Update status
      await pool.query('UPDATE job_postings SET authenticity = $1, authenticity_signals = $2 WHERE id = $3', [
        status,
        JSON.stringify({ signals }),
        id,
      ]);
      stats[status]++;
    }

    return {
      data: stats,
      metadata: {
        execution_time_ms: Date.now() - startTime,
      },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 10000;
  }
}
