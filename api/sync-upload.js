import { normalizeCloudAlertPayload } from './_lib/alertRules.js';
import { createRedisClient, verifySyncSecret } from './_lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let redis;
  try {
    // Only enforce secret if it is configured on the server
    if (!verifySyncSecret(req)) {
      return res.status(401).json({ error: `Unauthorized: Invalid Sync Secret` });
    }

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const action = searchParams.get('action');
    redis = await createRedisClient();

    if (action === 'alerts') {
      const payload = normalizeCloudAlertPayload(req.body || {});
      if (!payload.userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      await redis.set(`alert_config:${payload.userId}`, JSON.stringify(payload));
      await redis.set(`alert_config_time:${payload.userId}`, String(payload.syncedAt));
      return res.status(200).json({
        success: true,
        alertsSynced: payload.alerts.length,
        syncedAt: payload.syncedAt,
      });
    }

    const { userId, data } = req.body || {};

    if (!userId || !data) {
      return res.status(400).json({ error: 'Missing userId or data' });
    }

    const key = `sync_data:${userId}`;
    const timeKey = `sync_time:${userId}`;
    const stringifiedData = JSON.stringify(data);

    await redis.set(key, stringifiedData);
    await redis.set(timeKey, Date.now().toString());

    return res.status(200).json({ success: true, message: 'Data synced to cloud successfully' });

  } catch (error) {
    console.error('Sync Upload Error:', error);
    let errorMessage = error.message;
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('pattern')) {
      errorMessage = '连接云端数据库失败，请检查数据库链接格式是否正确。';
    }
    return res.status(500).json({ error: errorMessage });
  } finally {
    if (redis) await redis.close();
  }
}
