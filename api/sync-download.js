import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers['authorization'] || '';
    const expectedSecret = process.env.SYNC_SECRET?.replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    let providedSecret = authHeader.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    try { providedSecret = decodeURIComponent(providedSecret); } catch(e) {}
    
    // Only enforce secret if it is configured on the server
    if (expectedSecret && providedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Sync Secret' });
    }

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const userId = searchParams.get('userId');

    // ==========================================
    // Setup Client (ioredis or upstash)
    // ==========================================
    let isIoredis = false;
    let client;
    
    if (process.env.REDIS_URL) {
      isIoredis = true;
      client = new Redis(process.env.REDIS_URL);
    } else {
      const kvUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

      if (!kvUrl || !kvToken) {
        return res.status(500).json({ error: `云端数据库未正确配置。支持 REDIS_URL 或 KV_REST_API_URL。` });
      }
      client = new UpstashRedis({ url: kvUrl, token: kvToken });
    }

    // ==========================================
    // Fetch Data
    // ==========================================
    if (userId) {
      // Fetch specific user's backup
      const key = `sync_data:${userId}`;
      let dataStr;
      
      if (isIoredis) {
        dataStr = await client.get(key);
        await client.quit();
      } else {
        const upData = await client.get(key);
        dataStr = typeof upData === 'string' ? upData : JSON.stringify(upData);
      }

      if (!dataStr) {
        return res.status(200).json({ mergedData: null, usersFound: 0 });
      }

      let parsedData;
      try {
        parsedData = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
      } catch (e) {
        parsedData = dataStr;
      }

      return res.status(200).json({ mergedData: parsedData, usersFound: 1 });
    } else {
      // Merge all users' backups
      let keys = [];
      if (isIoredis) {
        keys = await client.keys('sync_data:*');
      } else {
        keys = await client.keys('sync_data:*');
      }

      if (!keys || keys.length === 0) {
        if (isIoredis) await client.quit();
        return res.status(200).json({ mergedData: null, usersFound: 0 });
      }

      let allData = [];
      if (isIoredis) {
        if (keys.length > 0) {
          const values = await client.mget(...keys);
          allData = values.map(v => {
            try { return JSON.parse(v); } catch(e) { return v; }
          }).filter(Boolean);
        }
        await client.quit();
      } else {
        // Upstash mget
        if (keys.length > 0) {
          const values = await client.mget(...keys);
          allData = values.map(v => {
            if (typeof v === 'string') {
              try { return JSON.parse(v); } catch(e) { return v; }
            }
            return v;
          }).filter(Boolean);
        }
      }

      // Merge tables
      const mergedDump = { tables: {}, version: Date.now() };

      for (const userDump of allData) {
        if (!userDump || !userDump.tables) continue;

        for (const [tableName, rows] of Object.entries(userDump.tables)) {
          if (!mergedDump.tables[tableName]) {
            mergedDump.tables[tableName] = [];
          }

          // Use Map to deduplicate by 'id'
          const existingRows = mergedDump.tables[tableName];
          const rowMap = new Map(existingRows.map((r) => [r.id, r]));

          for (const row of rows) {
            if (!rowMap.has(row.id)) {
              rowMap.set(row.id, row);
            } else {
              // Same ID exists, pick the one with newer updated_at, or just overwrite
              const existing = rowMap.get(row.id);
              if (row.updated_at && existing.updated_at) {
                if (row.updated_at > existing.updated_at) {
                  rowMap.set(row.id, row);
                }
              } else {
                rowMap.set(row.id, row); // Default to overwrite
              }
            }
          }

          mergedDump.tables[tableName] = Array.from(rowMap.values());
        }
      }

      return res.status(200).json({
        mergedData: mergedDump,
        usersFound: keys.length,
      });
    }

  } catch (error) {
    console.error('Sync Download Error:', error);
    let errorMessage = error.message;
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('pattern')) {
      errorMessage = '连接云端数据库失败，请检查数据库链接格式是否正确。';
    }
    return res.status(500).json({ error: errorMessage });
  }
}
