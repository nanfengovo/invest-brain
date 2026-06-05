import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization');
    const expectedSecret = process.env.SYNC_SECRET;
    
    // Only enforce secret if it is configured on the server
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Sync Secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Redis
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        process.env.UPSTASH_REDIS_REST_URL = process.env.KV_REST_API_URL;
        process.env.UPSTASH_REDIS_REST_TOKEN = process.env.KV_REST_API_TOKEN;
      } else {
        return new Response(JSON.stringify({ error: 'Server KV/Redis not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const redis = Redis.fromEnv();
    
    // Find all keys matching sync_data:*
    let cursor = 0;
    const allKeys = [];
    
    do {
      // redis.scan returns [cursor, [keys]]
      const result = await redis.scan(cursor, { match: 'sync_data:*', count: 100 });
      cursor = result[0];
      allKeys.push(...result[1]);
    } while (cursor !== 0 && cursor !== '0');

    if (allKeys.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No data found in cloud',
        usersFound: 0,
        mergedData: { tables: {} }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch all data
    // Upstash provides mget for multiple keys
    const rawDataList = await redis.mget(...allKeys);
    
    // Merge all tables
    const mergedTables = {
      assets: [],
      informations: [],
      viewpoints: [],
      decisions: [],
      decision_info_links: [],
      trades: [],
      reviews: [],
    };
    
    let validUserCount = 0;

    for (let i = 0; i < rawDataList.length; i++) {
      const dumpStr = rawDataList[i];
      if (!dumpStr) continue;
      
      try {
        const dump = typeof dumpStr === 'string' ? JSON.parse(dumpStr) : dumpStr;
        if (!dump.tables) continue;
        
        validUserCount++;
        
        // Merge rows for each table
        for (const [tableName, rows] of Object.entries(dump.tables)) {
          if (mergedTables[tableName] && Array.isArray(rows)) {
            mergedTables[tableName].push(...rows);
          }
        }
      } catch (e) {
        console.error(`Error parsing data for key ${allKeys[i]}:`, e);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Successfully merged data from ${validUserCount} users`,
      usersFound: validUserCount,
      mergedData: { tables: mergedTables }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync Download Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
