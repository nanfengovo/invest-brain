import { createRedisClient, parseRedisJson, verifySyncSecret } from './_lib/redis.js';

const PERSONAL_SYNC_TABLES = new Set([
  'assets',
  'informations',
  'information_asset_links',
  'information_sector_links',
  'decisions',
  'decision_info_links',
  'reviews',
  'viewpoints',
  'trades',
  'price_alerts',
]);
const TEAM_SYNC_TABLES = new Set(['assets', 'trades']);

function filterDumpTables(dump, scope) {
  const allowedTables = scope === 'team' ? TEAM_SYNC_TABLES : PERSONAL_SYNC_TABLES;
  const tables = {};
  for (const [tableName, rows] of Object.entries(dump?.tables || {})) {
    if (allowedTables.has(tableName)) {
      tables[tableName] = rows;
    }
  }
  return {
    ...dump,
    tables,
  };
}

function mergeUserDumps(allData, scope) {
  const mergedDump = { tables: {}, version: Date.now() };

  for (const rawDump of allData) {
    const userDump = filterDumpTables(rawDump, scope);
    if (!userDump || !userDump.tables) continue;

    for (const [tableName, rows] of Object.entries(userDump.tables)) {
      if (!Array.isArray(rows)) continue;
      if (!mergedDump.tables[tableName]) {
        mergedDump.tables[tableName] = [];
      }

      const rowMap = new Map(mergedDump.tables[tableName].map((row) => [row.id, row]));

      for (const row of rows) {
        if (!row?.id) continue;
        const existing = rowMap.get(row.id);
        if (!existing) {
          rowMap.set(row.id, row);
        } else if (row.updated_at && existing.updated_at) {
          rowMap.set(row.id, row.updated_at > existing.updated_at ? row : existing);
        } else {
          rowMap.set(row.id, row);
        }
      }

      mergedDump.tables[tableName] = Array.from(rowMap.values());
    }
  }

  return mergedDump;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '不支持的请求方法' });
  }

  let redis;
  try {
    if (!verifySyncSecret(req)) {
      return res.status(401).json({ error: '同步暗号不正确' });
    }

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const userId = searchParams.get('userId');
    const requestedScope = searchParams.get('scope');
    const scope = requestedScope === 'team'
      ? 'team'
      : requestedScope === 'personal'
        ? 'personal'
        : userId
          ? 'personal'
          : 'legacy';

    const keyPrefix = scope === 'team' ? 'team_sync_data' : 'sync_data';
    redis = await createRedisClient();

    if (userId) {
      const parsedData = parseRedisJson(await redis.get(`${keyPrefix}:${userId}`));
      if (!parsedData) {
        return res.status(200).json({ mergedData: null, usersFound: 0, scope });
      }

      return res.status(200).json({ mergedData: filterDumpTables(parsedData, scope), usersFound: 1, scope });
    }

    const keys = await redis.keys(`${keyPrefix}:*`);
    if (!keys || keys.length === 0) {
      return res.status(200).json({ mergedData: null, usersFound: 0, scope });
    }

    const values = await redis.mget(keys);
    const allData = values.map(parseRedisJson).filter(Boolean);

    return res.status(200).json({
      mergedData: mergeUserDumps(allData, scope),
      usersFound: keys.length,
      scope,
    });
  } catch (error) {
    console.error('Sync Download Error:', error);
    let errorMessage = error.message || '云端同步失败';
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('pattern')) {
      errorMessage = '连接云端数据库失败，请检查数据库链接格式是否正确。';
    }
    return res.status(500).json({ error: errorMessage });
  } finally {
    if (redis) await redis.close();
  }
}
