import Anthropic from '@anthropic-ai/sdk';
import { dbProfiles } from '@jobagent/shared/src/index';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateCoverLetter(draft: any, posting: any): Promise<string> {
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

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}
