import { JobSource, RawPosting } from '@jobagent/shared/src/interfaces/source';
import { JobPosting } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';
import companies from './ashby-companies.json';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class AshbySource implements JobSource {
  name = 'ashby';
  baseUrl = 'https://api.ashbyhq.com/posting-api/job-board';

  async fetchJobs(profile: Profile, _lookbackHours: number, max: number): Promise<RawPosting[]> {
    const allJobs: RawPosting[] = [];

    for (const company of companies) {
      if (allJobs.length >= max) break;

      try {
        const url = `${this.baseUrl}/${company}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        if (!response.ok) continue;

        const data = await response.json() as { jobs?: RawPosting[] };
        if (data.jobs) {
          for (const job of data.jobs) {
            (job as Record<string, unknown>)._company_name = company;
            allJobs.push(job);
            if (allJobs.length >= max) break;
          }
        }
      } catch {
        // Skip failures
      }

      await sleep(150);
    }

    const keywords = profile.target_roles.map(r => r.toLowerCase());
    return allJobs.filter(job => {
      const title = ((job as Record<string, unknown>).title as string || '').toLowerCase();
      return keywords.some(k => title.includes(k.split(' ').pop()!));
    });
  }

  normalizePosting(raw: RawPosting): JobPosting {
    const r = raw as Record<string, unknown>;
    const company = r._company_name as string || '';
    const location = (r.location as string) || (r.locationName as string) || 'Unknown';

    return {
      source: 'ashby',
      source_id: `ashby-${r.id}`,
      company,
      company_domain: null,
      role_title: (r.title as string) || 'Unknown',
      location,
      remote: this.detectRemote(location),
      posted_at: new Date((r.publishedAt as string) || Date.now()),
      apply_url: (r.applyUrl as string) || (r.applicationUrl as string) || '',
      apply_method: 'ashby_api',
      description_md: this.htmlToMd((r.descriptionHtml as string) || (r.description as string) || ''),
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

  private htmlToMd(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
