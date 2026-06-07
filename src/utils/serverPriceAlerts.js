import { db } from '../db/database';

export async function syncServerPriceAlerts({
  syncUserId,
  syncSecret,
  notificationConfig,
  marketDataConfig,
} = {}) {
  const userId = String(syncUserId || '').trim();
  const secret = String(syncSecret || '').trim();

  if (!userId || !secret) {
    return { skipped: true, reason: 'missing_sync_config' };
  }

  const alerts = await db.getPriceAlerts('ACTIVE');
  const response = await fetch('/api/price-alerts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${encodeURIComponent(secret)}`,
    },
    body: JSON.stringify({
      userId,
      alerts,
      notificationConfig,
      marketDataConfig,
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '后台提醒同步失败');
  return json;
}
