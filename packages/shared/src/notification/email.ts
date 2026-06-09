// Mocking email sending for now
export async function sendDigestEmail(userId: string, _digest: unknown): Promise<void> {
  console.log(`[Notification] Sending digest email to user ${userId}`);
  // Real implementation would use nodemailer to send HTML email
}
