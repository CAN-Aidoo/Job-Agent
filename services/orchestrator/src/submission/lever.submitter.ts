import { SubmissionStrategy, SubmissionResult } from './strategy';
import { Profile } from '@jobagent/shared/src/interfaces/profile';
import { getPool } from '@jobagent/shared/src/db/client';
import * as fs from 'fs';

export default class LeverSubmitter implements SubmissionStrategy {
  name = 'lever';

  async execute(
    draft: { cover_letter: string; screening_answers: unknown; resume_variant_id: string | null },
    posting: Record<string, unknown>,
    profile: Profile
  ): Promise<SubmissionResult> {
    const hostedUrl = posting.apply_url as string;
    // Extract posting ID from Lever URL
    const match = hostedUrl.match(/lever\.co\/([^/]+)\/([a-f0-9-]+)/);
    if (!match) {
      return { success: false, error: 'Cannot parse Lever apply URL' };
    }

    const [, , postingId] = match;

    // Get resume as base64
    let resumeBase64 = '';
    if (draft.resume_variant_id) {
      const pool = getPool();
      const { rows } = await pool.query<{ file_path: string }>(
        'SELECT file_path FROM resume_variants WHERE id = $1',
        [draft.resume_variant_id]
      );
      if (rows[0] && fs.existsSync(rows[0].file_path)) {
        resumeBase64 = fs.readFileSync(rows[0].file_path).toString('base64');
      }
    }

    const body = {
      name: profile.full_name,
      email: profile.email,
      phone: profile.phone || undefined,
      resume: resumeBase64 || undefined,
      org: '',
      urls: {
        LinkedIn: profile.links.linkedin || undefined,
        GitHub: profile.links.github || undefined,
        Portfolio: profile.links.portfolio || undefined,
      },
      comments: draft.cover_letter || '',
    };

    const url = `https://api.lever.co/v0/postings/${postingId}/apply`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          receipt: {
            provider: 'lever',
            postingId,
            applicationId: (data as { applicationId?: string }).applicationId,
            submitted_at: new Date().toISOString(),
          },
        };
      } else {
        const text = await response.text();
        return { success: false, error: `Lever API ${response.status}: ${text}` };
      }
    } catch (err) {
      return { success: false, error: `Lever submission error: ${(err as Error).message}` };
    }
  }
}
