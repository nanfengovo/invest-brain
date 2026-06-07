import { db } from '../db/database';

const SYNC_USER_ID_KEY = 'invest_sync_user_id';
const SYNC_SECRET_KEY = 'invest_sync_secret';

const DEFAULT_NOTIFICATION_CONFIG = {
  emailEnabled: false,
  emailApiKey: '',
  emailFrom: '',
  emailTo: '',
  feishuEnabled: false,
  feishuWebhook: '',
  browserEnabled: true,
  alertCheckIntervalMinutes: 1,
};

const DEFAULT_MARKET_DATA_CONFIG = {
  optionProvider: 'auto',
  tradierToken: '',
  polygonToken: '',
};

async function loadJsonSetting(key, fallback) {
  try {
    const raw = await db.getSetting(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

async function getSyncCredentials() {
  const userId = (
    localStorage.getItem(SYNC_USER_ID_KEY) ||
    await db.getSetting('sync_user_id') ||
    ''
  ).trim();
  const secret = (
    localStorage.getItem(SYNC_SECRET_KEY) ||
    await db.getSetting('sync_secret') ||
    ''
  ).trim();

  return { userId, secret };
}

export async function syncCloudAlerts(overrides = {}) {
  try {
    const { userId, secret } = await getSyncCredentials();
    if (!userId || !secret) {
      return { skipped: true, reason: 'missing_sync_credentials' };
    }

    const alerts = await db.getPriceAlerts('ACTIVE');
    const notificationConfig = overrides.notificationConfig || await loadJsonSetting(
      'notification_config',
      DEFAULT_NOTIFICATION_CONFIG
    );
    const marketDataConfig = overrides.marketDataConfig || await loadJsonSetting(
      'market_data_config',
      DEFAULT_MARKET_DATA_CONFIG
    );

    const response = await fetch('/api/sync-upload?action=alerts', {
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

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || '云端提醒同步失败');
    }

    return json;
  } catch (error) {
    console.warn('[CloudAlerts] Sync failed:', error);
    return { success: false, error: error.message };
  }
}
