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
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    
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

    const kvUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      // For debugging, returning the presence of keys, without exposing secrets
      const hasUpstashUrl = !!process.env.UPSTASH_REDIS_REST_URL;
      const hasUpstashToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
      const hasKvUrl = !!process.env.KV_REST_API_URL;
      const hasKvToken = !!process.env.KV_REST_API_TOKEN;
      return new Response(JSON.stringify({ 
        error: `Server KV/Redis not configured. Env status: UPSTASH(${hasUpstashUrl},${hasUpstashToken}) KV(${hasKvUrl},${hasKvToken})` 
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
