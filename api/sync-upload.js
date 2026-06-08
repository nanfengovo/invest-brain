import { normalizeCloudAlertPayload } from './_lib/alertRules.js';
import { createRedisClient, verifySyncSecret } from './_lib/redis.js';

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

    if (!userId || !data) {
      return res.status(400).json({ error: '缺少用户代号或同步数据' });
    }

    const normalizedData = normalizeSyncDump(data, userId, scope);

    const keyPrefix = scope === 'team' ? 'team_sync_data' : 'sync_data';
    const timePrefix = scope === 'team' ? 'team_sync_time' : 'sync_time';
    const key = `${keyPrefix}:${userId}`;
    const timeKey = `${timePrefix}:${userId}`;
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
  if (!data?.tables?.trades || !Array.isArray(data.tables.trades)) return data;
  const normalizedUserId = String(userId || '').trim();
  const trades = data.tables.trades
    .filter((trade) => {
      const author = String(trade?.author || trade?.source_author || '').trim();
      return !normalizedUserId || author === normalizedUserId;
    })
    .map((trade) => ({
      ...trade,
      author: String(trade.author || normalizedUserId || '未标记').trim() || '未标记',
      source_author: String(trade.source_author || trade.author || normalizedUserId || '未标记').trim() || '未标记',
      workspace_scope: scope,
      source_scope: scope,
      origin_id: trade.origin_id || trade.id,
      sync_status: 'synced',
    }));

  return {
    ...data,
    workspaceScope: scope,
    author: normalizedUserId,
    tables: {
      ...data.tables,
      trades,
    },
  };
}
