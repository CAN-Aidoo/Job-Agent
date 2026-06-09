import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash',
});

export type EmailClassification =
  | 'interview_invite'
  | 'rejection'
  | 'recruiter_outreach'
  | 'screening_required'
  | 'noise';

export async function classifyEmail(subject: string, body: string): Promise<EmailClassification> {
  const prompt = `
    Classify the following email for a job seeker.
    
    Subject: ${subject}
    Body: ${body.substring(0, 500)}...
    
    Return ONLY one of these labels: 'interview_invite', 'rejection', 'recruiter_outreach', 'screening_required', 'noise'.
  `;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  return text as EmailClassification;
}
