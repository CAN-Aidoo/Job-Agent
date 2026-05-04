import { JobPosting } from './job';
import { Profile } from './profile';

export interface RawPosting {
  [key: string]: unknown;
}

export interface JobSource {
  name: string;
  baseUrl: string;
  fetchJobs(profile: Profile, lookbackHours: number, max: number): Promise<RawPosting[]>;
  normalizePosting(raw: RawPosting): JobPosting;
}
