import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type EmailClassification = 'interview_invite' | 'rejection' | 'recruiter_outreach' | 'screening_response_required' | 'noise';

export async function classifyEmail(subject: string, body: string): Promise<EmailClassification> {
  const prompt = `
    Classify the following email for a job seeker.
    
    Subject: ${subject}
    Body: ${body.substring(0, 500)}...
    
    Return ONLY one of these labels: 'interview_invite', 'rejection', 'recruiter_outreach', 'screening_response_required', 'noise'.
  `;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 50,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (message.content[0].type === 'text' ? message.content[0].text : 'noise').trim();
  return text as EmailClassification;
}
