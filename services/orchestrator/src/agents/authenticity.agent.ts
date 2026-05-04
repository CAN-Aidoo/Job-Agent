import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import * as dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

const SCAM_PHRASES = [
  'upfront fee', 'equipment purchase', 'send money', 'wire transfer',
  'pay for training', 'processing fee', 'registration fee',
  'send payment', 'western union', 'money order', 'gift card',
  'cryptocurrency payment required',
];

const GENERIC_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];

export default class AuthenticityVerifier implements JobAgent {
  name = 'AuthenticityVerifier';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Get posting IDs from previous steps
    const dedupOutput = input.previousOutputs.get('dedup');
    const postingIds: string[] = dedupOutput?.data
      ? (dedupOutput.data as { unique_posting_ids?: string[] }).unique_posting_ids || []
      : [];

    if (postingIds.length === 0) {
      return {
        data: { verified: 0, suspicious: 0, scam: 0 },
        metadata: { execution_time_ms: Date.now() - startTime },
      };
    }

    const { rows: postings } = await pool.query<{
      id: string; company: string; data: Record<string, unknown>;
    }>('SELECT id, company, data FROM job_postings WHERE id = ANY($1)', [postingIds]);

    let verified = 0, suspicious = 0, scam = 0;

    for (const posting of postings) {
      const jobData = posting.data as Record<string, unknown>;
      const description = (jobData.description_md as string || '').toLowerCase();
      const applyUrl = (jobData.apply_url as string || '');
      const applyMethod = (jobData.apply_method as string || '');
      const companyDomain = jobData.company_domain as string | null;
      const signals: Record<string, unknown> = {};

      let status: 'verified' | 'suspicious' | 'scam' = 'verified';

      // Check for scam phrases
      const foundScamPhrases = SCAM_PHRASES.filter(p => description.includes(p));
      if (foundScamPhrases.length > 0) {
        status = 'scam';
        signals.scam_phrases = foundScamPhrases;
      }

      // Check for generic email in apply URL
      if (GENERIC_EMAIL_DOMAINS.some(d => applyUrl.includes(d))) {
        status = status === 'scam' ? 'scam' : 'suspicious';
        signals.generic_email_only = true;
      }

      // Check company domain resolution
      if (companyDomain && status !== 'scam') {
        try {
          await dnsLookup(companyDomain);
          signals.domain_resolves = true;
        } catch {
          status = 'suspicious';
          signals.missing_company_domain = true;
        }
      }

      // Check for known ATS apply methods (strong verification signal)
      if (['greenhouse_api', 'lever_api', 'ashby_api'].includes(applyMethod)) {
        if (status !== 'scam') {
          status = 'verified';
          signals.known_ats = true;
        }
      }

      // Comp sanity check
      const compRange = jobData.comp_range as { max?: number } | null;
      if (compRange?.max && compRange.max > 500000) {
        status = status === 'scam' ? 'scam' : 'suspicious';
        signals.suspicious_comp = true;
      }

      // Update database
      await pool.query(
        'UPDATE job_postings SET authenticity = $1, authenticity_signals = $2 WHERE id = $3',
        [status, JSON.stringify(signals), posting.id]
      );

      if (status === 'verified') verified++;
      else if (status === 'suspicious') suspicious++;
      else scam++;
    }

    return {
      data: { verified, suspicious, scam, total: postings.length },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 10_000;
  }
}
