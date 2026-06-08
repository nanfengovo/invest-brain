export function normalizeDecisionAssetId(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

export function buildDecisionAssetPayload(assetId, sector) {
  const normalizedId = normalizeDecisionAssetId(assetId);
  if (!normalizedId) return null;

  const normalizedSector = String(sector || '').trim();
  return {
    id: normalizedId,
    symbol: normalizedId,
    name: normalizedId,
    type: 'STOCK',
    sector: normalizedSector || null,
  };
}

export function getDecisionPersistenceErrorMessage(error, action = '保存') {
  const rawMessage = String(error?.message || error || '').trim();
  const fallback = `${action}失败：系统遇到异常，请稍后重试`;

  if (!rawMessage) return fallback;

  if (/SQLITE_CONSTRAINT_FOREIGNKEY|FOREIGN\s+KEY|constraint failed|code 787/i.test(rawMessage)) {
    return `${action}失败：关联的资产或信息不存在，请刷新页面后重试`;
  }

  if (/timed out|timeout/i.test(rawMessage)) {
    return `${action}失败：数据库响应超时，请稍后重试`;
  }

  if (/readonly|read-only/i.test(rawMessage)) {
    return `${action}失败：当前工作区不可编辑，请切换到个人工作区`;
  }

  return /[A-Za-z_]{4,}/.test(rawMessage) ? fallback : rawMessage;
}
