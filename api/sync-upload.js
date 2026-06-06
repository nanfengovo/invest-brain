import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers['authorization'] || '';
    const expectedSecret = process.env.SYNC_SECRET?.replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    
    let providedSecret = authHeader.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    try { providedSecret = decodeURIComponent(providedSecret); } catch(e) {}
    
    // Only enforce secret if it is configured on the server
    if (expectedSecret && providedSecret !== expectedSecret) {
      return res.status(401).json({ error: `Unauthorized: Invalid Sync Secret` });
    }

    const { userId, data } = req.body || {};

    if (!userId || !data) {
      return res.status(400).json({ error: 'Missing userId or data' });
    }

    const key = `sync_data:${userId}`;
    const timeKey = `sync_time:${userId}`;
    const stringifiedData = JSON.stringify(data);

    // Try standard REDIS_URL first (via ioredis)
    if (process.env.REDIS_URL) {
      const client = new Redis(process.env.REDIS_URL);
      await client.set(key, stringifiedData);
      await client.set(timeKey, Date.now().toString());
      await client.quit();
      return res.status(200).json({ success: true, message: 'Data synced to cloud successfully' });
    }

    // Fallback to Upstash / Vercel KV REST API
    const kvUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      return res.status(500).json({ error: `云端数据库未正确配置。支持 REDIS_URL 或 KV_REST_API_URL。` });
    }

    const upstashRedis = new UpstashRedis({ url: kvUrl, token: kvToken });
    await upstashRedis.set(key, stringifiedData);
    await upstashRedis.set(timeKey, Date.now());

    return res.status(200).json({ success: true, message: 'Data synced to cloud successfully' });

  } catch (error) {
    console.error('Sync Upload Error:', error);
    let errorMessage = error.message;
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('pattern')) {
      errorMessage = '连接云端数据库失败，请检查数据库链接格式是否正确。';
    }
    return res.status(500).json({ error: errorMessage });
  }
}
