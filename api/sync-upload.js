import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const expectedSecret = process.env.SYNC_SECRET?.replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    
    let providedSecret = authHeader.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    try { providedSecret = decodeURIComponent(providedSecret); } catch(e) {}
    
    // Only enforce secret if it is configured on the server
    if (expectedSecret && providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: `Unauthorized: Invalid Sync Secret (Length: ${providedSecret.length}, Expected: ${expectedSecret.length})` }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { userId, data } = body;

    if (!userId || !data) {
      return new Response(JSON.stringify({ error: 'Missing userId or data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let kvUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    let kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    // Auto-parse Upstash REDIS_URL (e.g. redis://default:PASSWORD@host:port) to REST API
    if (!kvUrl && !kvToken && process.env.REDIS_URL) {
      const match = process.env.REDIS_URL.match(/rediss?:\/\/[^:]*:([^@]+)@([^:]+):\d+/);
      if (match) {
        kvToken = match[1];
        kvUrl = `https://${match[2]}`;
      }
    }

    if (!kvUrl || !kvToken) {
      return new Response(JSON.stringify({ 
        error: `云端数据库未正确配置，请在 Vercel 环境变量中检查 REDIS_URL 或 KV_REST_API_URL。` 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const redis = new Redis({
      url: kvUrl,
      token: kvToken,
    });
    
    // Save to Redis (overwrite existing for this user)
    const key = `sync_data:${userId}`;
    
    // We compress to a string. Upstash handles objects automatically via JSON serialization.
    await redis.set(key, JSON.stringify(data));
    
    // Also update a "last_sync_time" key
    await redis.set(`sync_time:${userId}`, Date.now());

    return new Response(JSON.stringify({ success: true, message: 'Data synced to cloud successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync Upload Error:', error);
    let errorMessage = error.message;
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('pattern')) {
      errorMessage = '连接云端数据库失败，请检查数据库链接格式是否正确。';
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
