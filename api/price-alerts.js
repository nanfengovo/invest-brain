import {
  assertSyncAuthorized,
  normalizeServerAlertConfig,
  saveServerAlertConfig,
} from './_lib/server-alerts.js';

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

  const auth = assertSyncAuthorized(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const payload = req.body || {};
    const normalized = normalizeServerAlertConfig(payload);

    if (!normalized.userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const saved = await saveServerAlertConfig(normalized.userId, normalized);
    return res.status(200).json({
      success: true,
      userId: saved.userId,
      activeAlerts: saved.alerts.length,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    console.error('Price Alerts Sync Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
