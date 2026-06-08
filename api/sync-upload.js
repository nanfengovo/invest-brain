import { normalizeCloudAlertPayload } from './_lib/alertRules.js';
import { createRedisClient, verifySyncSecret } from './_lib/redis.js';

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
const TEAM_SYNC_TABLES = new Set([
  'assets',
  'informations',
  'information_asset_links',
  'information_sector_links',
  'decisions',
  'decision_info_links',
  'viewpoints',
  'trades',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '不支持的请求方法' });
  }

  let redis;
  try {
    // Only enforce secret if it is configured on the server
    if (!verifySyncSecret(req)) {
      return res.status(401).json({ error: '同步暗号不正确' });
    }

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const action = searchParams.get('action');
    redis = await createRedisClient();

    if (action === 'alerts') {
      const payload = normalizeCloudAlertPayload(req.body || {});
      if (!payload.userId) {
        return res.status(400).json({ error: '缺少用户代号' });
      }

      await redis.set(`alert_config:${payload.userId}`, JSON.stringify(payload));
      await redis.set(`alert_config_time:${payload.userId}`, String(payload.syncedAt));
      return res.status(200).json({
        success: true,
        alertsSynced: payload.alerts.length,
        syncedAt: payload.syncedAt,
      });
    }

    const { userId, data } = req.body || {};
    const scope = req.body?.scope === 'team' || searchParams.get('scope') === 'team'
      ? 'team'
      : 'personal';

    if (!userId) {
      return res.status(400).json({ error: '缺少用户代号' });
    }

    const keyPrefix = scope === 'team' ? 'team_sync_data' : 'sync_data';
    const timePrefix = scope === 'team' ? 'team_sync_time' : 'sync_time';
    const key = `${keyPrefix}:${userId}`;
    const timeKey = `${timePrefix}:${userId}`;

    if (action === 'withdraw-team') {
      if (scope !== 'team') {
        return res.status(400).json({ error: '撤回操作只支持团队空间' });
      }
      await redis.del(key);
      await redis.del(timeKey);
      return res.status(200).json({
        success: true,
        scope,
        message: '已撤回我发布到团队空间的数据',
      });
    }

    if (!data) {
      return res.status(400).json({ error: '缺少同步数据' });
    }

    const normalizedData = normalizeSyncDump(data, userId, scope);

    const stringifiedData = JSON.stringify(normalizedData);

    await redis.set(key, stringifiedData);
    await redis.set(timeKey, Date.now().toString());

    return res.status(200).json({
      success: true,
      scope,
      message: scope === 'team' ? '已同步到团队空间' : '个人云端备份已完成',
    });

  } catch (error) {
    console.error('Sync Upload Error:', error);
    let errorMessage = error.message;
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('pattern')) {
      errorMessage = '连接云端数据库失败，请检查数据库链接格式是否正确。';
    }
    return res.status(500).json({ error: errorMessage });
  } finally {
    if (redis) await redis.close();
  }
}

function normalizeSyncDump(data, userId, scope) {
  const allowedTables = scope === 'team' ? TEAM_SYNC_TABLES : PERSONAL_SYNC_TABLES;
  const sourceTables = data?.tables || {};
  const tables = {};

  for (const [tableName, rows] of Object.entries(sourceTables)) {
    if (allowedTables.has(tableName)) {
      tables[tableName] = rows;
    }
  }

  const normalizedUserId = String(userId || '').trim();
  const belongsToUser = (row) => {
    const author = String(row?.author || row?.source_author || '').trim();
    return !normalizedUserId || author === normalizedUserId;
  };
  const normalizeCollaborativeRow = (row) => ({
    ...row,
    author: String(row.author || normalizedUserId || '未标记').trim() || '未标记',
    source_author: String(row.source_author || row.author || normalizedUserId || '未标记').trim() || '未标记',
    workspace_scope: scope,
    source_scope: scope,
    origin_id: row.origin_id || row.id,
    sync_status: scope === 'team' ? 'published' : 'backup',
  });

  if (Array.isArray(tables.trades)) {
    tables.trades = tables.trades
      .filter(belongsToUser)
      .map((trade) => ({
        ...trade,
        author: String(trade.author || normalizedUserId || '未标记').trim() || '未标记',
        source_author: String(trade.source_author || trade.author || normalizedUserId || '未标记').trim() || '未标记',
        workspace_scope: scope,
        source_scope: scope,
        origin_id: trade.origin_id || trade.id,
        sync_status: scope === 'team' ? 'published' : 'backup',
      }));
  }

  for (const tableName of ['informations', 'decisions', 'viewpoints']) {
    if (!Array.isArray(tables[tableName])) continue;
    tables[tableName] = tables[tableName]
      .filter((row) => belongsToUser(row))
      .filter((row) => scope !== 'team' || row.team_visible === 1 || row.team_visible === true || row.team_visible === '1')
      .map(normalizeCollaborativeRow);
  }

  if (scope === 'team') {
    const infoIds = new Set((tables.informations || []).map((row) => row.id));
    const decisionIds = new Set((tables.decisions || []).map((row) => row.id));
    if (Array.isArray(tables.information_asset_links)) {
      tables.information_asset_links = tables.information_asset_links.filter((row) => infoIds.has(row.info_id));
    }
    if (Array.isArray(tables.information_sector_links)) {
      tables.information_sector_links = tables.information_sector_links.filter((row) => infoIds.has(row.info_id));
    }
    if (Array.isArray(tables.decision_info_links)) {
      tables.decision_info_links = tables.decision_info_links.filter((row) => decisionIds.has(row.decision_id) && infoIds.has(row.info_id));
    }
  }

  return {
    ...data,
    workspaceScope: scope,
    author: normalizedUserId,
    tables,
  };
}
