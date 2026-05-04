import { SubmissionStrategy, SubmissionResult } from './strategy';
import { Profile } from '@jobagent/shared/src/interfaces/profile';
import { getPool } from '@jobagent/shared/src/db/client';
import * as fs from 'fs';

export default class GreenhouseSubmitter implements SubmissionStrategy {
  name = 'greenhouse';

  async execute(
    draft: { cover_letter: string; screening_answers: unknown; resume_variant_id: string | null },
    posting: Record<string, unknown>,
    profile: Profile
  ): Promise<SubmissionResult> {
    const applyUrl = posting.apply_url as string;
    // Extract company and job ID from URL: https://boards.greenhouse.io/{company}/jobs/{id}
    const match = applyUrl.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
    if (!match) {
      return { success: false, error: 'Cannot parse Greenhouse apply URL' };
    }

    const [, company, jobId] = match;

    // Get resume file path
    let resumePath: string | null = null;
    if (draft.resume_variant_id) {
      const pool = getPool();
      const { rows } = await pool.query<{ file_path: string }>(
        'SELECT file_path FROM resume_variants WHERE id = $1',
        [draft.resume_variant_id]
      );
      if (rows[0]) resumePath = rows[0].file_path;
    }

    // Build form data
    const formData = new FormData();
    formData.append('first_name', profile.full_name.split(' ')[0]);
    formData.append('last_name', profile.full_name.split(' ').slice(1).join(' '));
    formData.append('email', profile.email);
    formData.append('phone', profile.phone || '');

    if (draft.cover_letter) {
      formData.append('cover_letter', draft.cover_letter);
    }

    if (resumePath && fs.existsSync(resumePath)) {
      const resumeBlob = new Blob([fs.readFileSync(resumePath)], { type: 'application/pdf' });
      formData.append('resume', resumeBlob, 'resume.pdf');
    }

    // Submit
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}/applications`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          receipt: {
            provider: 'greenhouse',
            company,
            jobId,
            response: data,
            submitted_at: new Date().toISOString(),
          },
        };
      } else {
        const text = await response.text();
        return { success: false, error: `Greenhouse API ${response.status}: ${text}` };
      }
    } catch (err) {
      return { success: false, error: `Greenhouse submission error: ${(err as Error).message}` };
    }
  }
}
