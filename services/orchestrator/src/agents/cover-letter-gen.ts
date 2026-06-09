import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbProfiles } from '@jobagent/shared/src/index';
import { ApplicationDraft, JobPosting } from '@jobagent/shared/src/interfaces/job';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash',
});

export async function generateCoverLetter(draft: ApplicationDraft, posting: JobPosting): Promise<string> {
  const profileRow = await dbProfiles.findByUserId(draft.user_id);
  const profile = profileRow?.data;

  if (!profile) {
    throw new Error('Profile not found for cover letter generation');
  }

  const prompt = `
    You are a professional career coach. Write a 200-word cover letter for the role of ${posting.role_title} at ${posting.company}.
    
    User Profile:
    Name: ${profile.full_name}
    Experience summary: ${JSON.stringify(profile.stack)}
    Voice/Style: ${profile.cover_letter_voice_sample}
    
    Job Description:
    ${posting.description_md}
    
    Only return the cover letter text, no preamble.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
