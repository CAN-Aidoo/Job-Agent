// Mocking push notification sending
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  _actionUrl: string,
): Promise<void> {
  console.log(`[Notification] Sending push to user ${userId}: ${title} - ${body}`);
  // Real implementation would use web-push with stored subscriptions
}
