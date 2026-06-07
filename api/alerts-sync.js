import { normalizeCloudAlertPayload } from './_lib/alertRules.js';
import { createRedisClient, verifySyncSecret } from './_lib/redis.js';

export const config = {
  maxDuration: 20,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!verifySyncSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Sync Secret' });
  }

  let redis;
  try {
    const payload = normalizeCloudAlertPayload(req.body || {});
    if (!payload.userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    redis = await createRedisClient();
    await redis.set(`alert_config:${payload.userId}`, JSON.stringify(payload));
    await redis.set(`alert_config_time:${payload.userId}`, String(payload.syncedAt));

    return res.status(200).json({
      success: true,
      alertsSynced: payload.alerts.length,
      syncedAt: payload.syncedAt,
    });
  } catch (error) {
    console.error('Alerts Sync Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (redis) await redis.close();
  }
}
