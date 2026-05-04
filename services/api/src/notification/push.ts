import webpush from 'web-push';
import { getPool } from '@jobagent/shared/src/db/client';

// Configure VAPID
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  actionUrl?: string
): Promise<void> {
  const pool = getPool();
  const { rows: subscriptions } = await pool.query<{
    endpoint: string; p256dh: string; auth: string;
  }>('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);

  const payload = JSON.stringify({
    title,
    body,
    url: actionUrl,
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
    } catch (err) {
      // Remove expired subscriptions
      if ((err as { statusCode?: number }).statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      }
    }
  }
}
