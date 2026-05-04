import { JobSource, RawPosting } from '@jobagent/shared/src/interfaces/source';
import { JobPosting, ApplyMethod } from '@jobagent/shared/src/interfaces/job';
import { Profile } from '@jobagent/shared/src/interfaces/profile';

export default class AdzunaSource implements JobSource {
  name = 'adzuna';
  baseUrl = 'https://api.adzuna.com/v1/api/jobs';

  async fetchJobs(profile: Profile, _lookbackHours: number, max: number): Promise<RawPosting[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;

    if (!appId || !appKey) {
      console.warn('[adzuna] ADZUNA_APP_ID or ADZUNA_APP_KEY not set, skipping');
      return [];
    }

    const country = profile.location.country.toLowerCase() === 'us' ? 'us' : 'gb';
    const what = profile.target_roles.join(' OR ');
    const where = profile.location_prefs.cities[0] || 'remote';

    const allResults: RawPosting[] = [];
    let page = 1;

    while (allResults.length < max) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: '50',
        what,
        where,
        max_days_old: '1',
        page: String(page),
      });

      try {
        const url = `${this.baseUrl}/${country}/search/${page}?${params}`;
        const response = await fetch(url);
        if (!response.ok) break;

        const data = await response.json() as { results?: RawPosting[] };
        if (!data.results || data.results.length === 0) break;

        allResults.push(...data.results);
        if (data.results.length < 50) break;
        page++;
      } catch {
        break;
      }
    }

    return allResults.slice(0, max);
  }

  normalizePosting(raw: RawPosting): JobPosting {
    const r = raw as Record<string, unknown>;
    const company = (r.company as { display_name?: string })?.display_name || 'Unknown';
    const location = (r.location as { display_name?: string })?.display_name || 'Unknown';
    const redirectUrl = (r.redirect_url as string) || '';

    return {
      source: 'adzuna',
      source_id: `adzuna-${r.id}`,
      company,
      company_domain: null,
      role_title: (r.title as string) || 'Unknown',
      location,
      remote: this.detectRemote((r.title as string || '') + ' ' + location),
      posted_at: new Date((r.created as string) || Date.now()),
      apply_url: redirectUrl,
      apply_method: this.detectApplyMethod(redirectUrl),
      description_md: (r.description as string) || '',
      comp_range: this.extractComp(r),
      raw: r,
    };
  }

  private detectRemote(text: string): 'fully' | 'hybrid' | 'onsite' | 'unknown' {
    const lower = text.toLowerCase();
    if (lower.includes('remote')) return 'fully';
    if (lower.includes('hybrid')) return 'hybrid';
    return 'unknown';
  }

  private detectApplyMethod(url: string): ApplyMethod {
    if (url.includes('greenhouse.io')) return 'greenhouse_api';
    if (url.includes('lever.co')) return 'lever_api';
    if (url.includes('ashbyhq.com')) return 'ashby_api';
    if (url.includes('workday')) return 'workday_form';
    return 'external';
  }

  private extractComp(r: Record<string, unknown>): { min: number; max: number; currency: string } | null {
    const min = r.salary_min as number | undefined;
    const max = r.salary_max as number | undefined;
    if (min && max) {
      return { min, max, currency: 'USD' };
    }
    return null;
  }
}
