import { JobSource, RawPosting } from '@jobagent/shared/src/interfaces/source';
import { JobPosting } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';
import companies from './lever-companies.json';

const DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class LeverSource implements JobSource {
  name = 'lever';
  baseUrl = 'https://api.lever.co/v0/postings';

  async fetchJobs(profile: Profile, _lookbackHours: number, max: number): Promise<RawPosting[]> {
    const allJobs: RawPosting[] = [];

    for (const company of companies) {
      if (allJobs.length >= max) break;

      try {
        const url = `${this.baseUrl}/${company}?mode=json`;
        const response = await fetch(url);
        if (!response.ok) continue;

        const data = (await response.json()) as RawPosting[];
        if (Array.isArray(data)) {
          for (const job of data) {
            (job as Record<string, unknown>)._company_name = company;
            allJobs.push(job);
            if (allJobs.length >= max) break;
          }
        }
      } catch {
        // Skip failures
      }

      await sleep(DELAY_MS);
    }

    const keywords = profile.target_roles.map((r) => r.toLowerCase());
    return allJobs.filter((job) => {
      const text = (((job as Record<string, unknown>).text as string) || '').toLowerCase();
      return keywords.some((k) => text.includes(k.split(' ').pop()!));
    });
  }

  normalizePosting(raw: RawPosting): JobPosting {
    const r = raw as Record<string, unknown>;
    const categories = r.categories as { location?: string } | undefined;
    const company = (r._company_name as string) || '';

    return {
      source: 'lever',
      source_id: `lever-${r.id}`,
      company,
      company_domain: null,
      role_title: (r.text as string) || 'Unknown',
      location: categories?.location || 'Unknown',
      remote: this.detectRemote(categories?.location || ''),
      posted_at: new Date((r.createdAt as number) || Date.now()),
      apply_url: (r.hostedUrl as string) || '',
      apply_method: 'lever_api',
      description_md: (r.descriptionPlain as string) || '',
      comp_range: null,
      raw: r,
    };
  }

  private detectRemote(location: string): 'fully' | 'hybrid' | 'onsite' | 'unknown' {
    const lower = location.toLowerCase();
    if (lower.includes('remote')) return 'fully';
    if (lower.includes('hybrid')) return 'hybrid';
    return 'unknown';
  }
}
