import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

export const SERVER_ALERT_KEY_PREFIX = 'price_alert_config:';

export function cleanSecret(value) {
  return String(value || '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function getBearerSecret(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  let provided = String(authHeader).replace(/^Bearer\s+/i, '');
  try {
    provided = decodeURIComponent(provided);
  } catch {
    // Keep original token if it was not URI encoded.
  }
  return cleanSecret(provided);
}

export function assertSyncAuthorized(req, { requireProvidedSecret = true } = {}) {
  const expectedSecret = cleanSecret(process.env.SYNC_SECRET);
  const providedSecret = getBearerSecret(req);

  if (requireProvidedSecret && !providedSecret) {
    return { ok: false, status: 401, error: 'Missing Sync Secret' };
  }

  if (expectedSecret && providedSecret !== expectedSecret) {
    return { ok: false, status: 401, error: 'Unauthorized: Invalid Sync Secret' };
  }

  return { ok: true, providedSecret };
}

export function assertCronAuthorized(req) {
  const expectedSecret = cleanSecret(process.env.PRICE_ALERT_CRON_SECRET || process.env.CRON_SECRET);
  if (!expectedSecret) return { ok: true };

  const providedSecret = getBearerSecret(req);
  if (providedSecret !== expectedSecret) {
    return { ok: false, status: 401, error: 'Unauthorized: Invalid Cron Secret' };
  }

  return { ok: true };
}

export async function createRedisConnection() {
  if (process.env.REDIS_URL) {
    return {
      client: new Redis(process.env.REDIS_URL),
      type: 'ioredis',
      close: async (client) => client.quit(),
    };
  }

  const kvUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    throw new Error('云端数据库未正确配置。支持 REDIS_URL 或 KV_REST_API_URL。');
  }

  return {
    client: new UpstashRedis({ url: kvUrl, token: kvToken }),
    type: 'upstash',
    close: async () => {},
  };
}

function parseRedisValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export function normalizeServerAlertConfig(payload = {}) {
  const userId = String(payload.userId || '').trim();
  const activeAlerts = Array.isArray(payload.alerts)
    ? payload.alerts.filter((alert) => alert && String(alert.status || 'ACTIVE') === 'ACTIVE')
    : [];

  return {
    userId,
    alerts: activeAlerts,
    notificationConfig: payload.notificationConfig || {},
    marketDataConfig: payload.marketDataConfig || {},
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

export async function saveServerAlertConfig(userId, payload) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw new Error('Missing userId');

  const config = normalizeServerAlertConfig({
    ...payload,
    userId: normalizedUserId,
    updatedAt: new Date().toISOString(),
  });
  const redis = await createRedisConnection();

  try {
    await redis.client.set(`${SERVER_ALERT_KEY_PREFIX}${normalizedUserId}`, JSON.stringify(config));
    return config;
  } finally {
    await redis.close(redis.client);
  }
}

export async function listServerAlertConfigs() {
  const redis = await createRedisConnection();

  try {
    const keys = await redis.client.keys(`${SERVER_ALERT_KEY_PREFIX}*`);
    if (!keys || keys.length === 0) return [];

    let values;
    if (redis.type === 'ioredis') {
      values = await redis.client.mget(...keys);
    } else {
      values = await redis.client.mget(...keys);
    }

    return values.map(parseRedisValue).filter(Boolean);
  } finally {
    await redis.close(redis.client);
  }
}

export async function updateServerAlertConfig(userId, config) {
  return saveServerAlertConfig(userId, {
    ...config,
    userId,
  });
}
