export interface ResumeVariant {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export type RemotePreference = 'required' | 'preferred' | 'open';
export type Seniority = 'junior' | 'mid' | 'senior' | 'staff' | 'principal';

export interface LocationPrefs {
  remote: RemotePreference;
  cities: string[];
  timezone_overlap_hours: number;
}

export interface CompBand {
  min: number;
  preferred: number;
  currency: string;
}

export interface ProfileLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface Profile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  location: {
    city: string;
    country: string;
    timezone: string;
  };
  work_authorization: string[];
  target_roles: string[];
  excluded_roles: string[];
  stack: string[];
  seniority: Seniority;
  comp_band: CompBand;
  location_prefs: LocationPrefs;
  excluded_companies: string[];
  excluded_industries: string[];
  resume_variants: ResumeVariant[];
  cover_letter_voice_sample: string;
  links: ProfileLinks;
}
