import nodemailer from 'nodemailer';

// Mocking email sending for now
export async function sendDigestEmail(userId: string, digest: any): Promise<void> {
  console.log(`[Notification] Sending digest email to user ${userId}`);
  // Real implementation would use nodemailer to send HTML email
}
