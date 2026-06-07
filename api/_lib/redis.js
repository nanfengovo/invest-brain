import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

export function cleanSecret(value) {
  let normalized = String(value || '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original normalized value if it was not URI encoded.
  }

  return normalized;
}

export function getBearerSecret(req) {
  return cleanSecret(String(req.headers?.authorization || '').replace(/^Bearer\s+/i, ''));
}

export function verifySyncSecret(req) {
  const expectedSecret = cleanSecret(process.env.SYNC_SECRET);
  if (!expectedSecret) return true;
  return getBearerSecret(req) === expectedSecret;
}

export async function createRedisClient() {
  if (process.env.REDIS_URL) {
    const client = new Redis(process.env.REDIS_URL);
    return {
      type: 'ioredis',
      client,
      get: (key) => client.get(key),
      set: (key, value) => client.set(key, value),
      keys: (pattern) => client.keys(pattern),
      mget: (keys) => (keys.length ? client.mget(...keys) : []),
      close: () => client.quit(),
    };
  }

  const kvUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    throw new Error('云端数据库未正确配置。支持 REDIS_URL 或 KV_REST_API_URL。');
  }

  const client = new UpstashRedis({ url: kvUrl, token: kvToken });
  return {
    type: 'upstash',
    client,
    get: (key) => client.get(key),
    set: (key, value) => client.set(key, value),
    keys: (pattern) => client.keys(pattern),
    mget: (keys) => (keys.length ? client.mget(...keys) : []),
    close: async () => {},
  };
}

export function parseRedisJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
