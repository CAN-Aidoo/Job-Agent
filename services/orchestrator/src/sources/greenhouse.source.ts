import { JobSource, RawPosting } from '@jobagent/shared/src/interfaces/source';
import { JobPosting } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';
import companies from './greenhouse-companies.json';

const DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class GreenhouseSource implements JobSource {
  name = 'greenhouse';
  baseUrl = 'https://boards-api.greenhouse.io/v1/boards';

  async fetchJobs(profile: Profile, _lookbackHours: number, max: number): Promise<RawPosting[]> {
    const allJobs: RawPosting[] = [];

    for (const company of companies) {
      if (allJobs.length >= max) break;

      try {
        const url = `${this.baseUrl}/${company}/jobs?content=true`;
        const response = await fetch(url);
        if (!response.ok) continue;

        const data = await response.json() as { jobs: RawPosting[] };
        if (data.jobs) {
          for (const job of data.jobs) {
            (job as Record<string, unknown>)._company_slug = company;
            allJobs.push(job);
            if (allJobs.length >= max) break;
          }
        }
      } catch {
        // Skip failures for individual companies
      }

      await sleep(DELAY_MS);
    }

    // Filter by profile target roles (basic keyword match)
    const keywords = profile.target_roles.map(r => r.toLowerCase());
    return allJobs.filter(job => {
      const title = ((job as Record<string, unknown>).title as string || '').toLowerCase();
      return keywords.some(k => title.includes(k.split(' ').pop()!));
    });
  }

  normalizePosting(raw: RawPosting): JobPosting {
    const r = raw as Record<string, unknown>;
    const location = r.location as { name?: string } | undefined;
    const companySlug = r._company_slug as string || '';

    return {
      source: 'greenhouse',
      source_id: `greenhouse-${r.id}`,
      company: companySlug,
      company_domain: null,
      role_title: (r.title as string) || 'Unknown',
      location: location?.name || 'Unknown',
      remote: this.detectRemote(location?.name || ''),
      posted_at: new Date((r.updated_at as string) || Date.now()),
      apply_url: `https://boards.greenhouse.io/${companySlug}/jobs/${r.id}`,
      apply_method: 'greenhouse_api',
      description_md: this.htmlToText((r.content as string) || ''),
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

  private htmlToText(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
