const DEFAULT_NOTIFICATION_CONFIG = {
  emailEnabled: false,
  emailApiKey: '',
  emailFrom: '',
  emailTo: '',
  feishuEnabled: false,
  feishuWebhook: '',
  browserEnabled: true,
  alertCheckIntervalMinutes: 1,
};

const DEFAULT_MARKET_DATA_CONFIG = {
  optionProvider: 'auto',
  marketDataToken: '',
  tradierToken: '',
  polygonToken: '',
  longbridgeAppKey: '',
  longbridgeAppSecret: '',
  longbridgeAccessToken: '',
};

export function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function parseChannels(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function shouldTrigger(alert, price) {
  const currentPrice = toFiniteNumber(price);
  const target = toFiniteNumber(alert?.target_price);
  if (currentPrice === null || target === null) return false;
  if (alert.condition === 'ABOVE') return currentPrice >= target;
  if (alert.condition === 'BELOW') return currentPrice <= target;
  return false;
}

export function conditionLabel(condition) {
  return condition === 'ABOVE' ? '高于或等于' : '低于或等于';
}

export function normalizeNotificationConfig(config = {}) {
  const merged = { ...DEFAULT_NOTIFICATION_CONFIG, ...(config || {}) };
  return {
    emailEnabled: Boolean(merged.emailEnabled),
    emailApiKey: String(merged.emailApiKey || ''),
    emailFrom: String(merged.emailFrom || ''),
    emailTo: String(merged.emailTo || ''),
    feishuEnabled: Boolean(merged.feishuEnabled),
    feishuWebhook: String(merged.feishuWebhook || ''),
    browserEnabled: Boolean(merged.browserEnabled),
    alertCheckIntervalMinutes: Math.min(
      720,
      Math.max(1, Math.round(Number(merged.alertCheckIntervalMinutes) || 1))
    ),
  };
}

export function normalizeMarketDataConfig(config = {}) {
  const merged = { ...DEFAULT_MARKET_DATA_CONFIG, ...(config || {}) };
  const provider = ['auto', 'marketdata', 'tradier', 'polygon', 'longbridge', 'yahoo'].includes(merged.optionProvider)
    ? merged.optionProvider
    : 'auto';

  return {
    optionProvider: provider,
    marketDataToken: String(merged.marketDataToken || ''),
    tradierToken: String(merged.tradierToken || ''),
    polygonToken: String(merged.polygonToken || ''),
    longbridgeAppKey: String(merged.longbridgeAppKey || ''),
    longbridgeAppSecret: String(merged.longbridgeAppSecret || ''),
    longbridgeAccessToken: String(merged.longbridgeAccessToken || ''),
  };
}

export function normalizeAlert(alert) {
  const symbol = String(alert?.symbol || '').trim().toUpperCase();
  const target = toFiniteNumber(alert?.target_price);
  if (!alert?.id || !symbol || target === null) return null;

  return {
    id: String(alert.id),
    symbol,
    asset_id: String(alert.asset_id || symbol),
    asset_type: alert.asset_type === 'OPTION' ? 'OPTION' : 'STOCK',
    condition: alert.condition === 'BELOW' ? 'BELOW' : 'ABOVE',
    target_price: target,
    last_price: toFiniteNumber(alert.last_price),
    status: alert.status === 'ACTIVE' ? 'ACTIVE' : String(alert.status || 'ACTIVE'),
    channels: parseChannels(alert.channels),
    note: alert.note ? String(alert.note).slice(0, 300) : null,
    updated_at: alert.updated_at || null,
  };
}

export function normalizeCloudAlertPayload(payload = {}) {
  const alerts = Array.isArray(payload.alerts)
    ? payload.alerts.map(normalizeAlert).filter((alert) => alert && alert.status === 'ACTIVE')
    : [];

  return {
    userId: String(payload.userId || '').trim(),
    alerts,
    notificationConfig: normalizeNotificationConfig(payload.notificationConfig),
    marketDataConfig: normalizeMarketDataConfig(payload.marketDataConfig),
    syncedAt: Date.now(),
  };
}

export function minutesToMs(minutes) {
  return Math.max(1, Number(minutes) || 1) * 60_000;
}

export function shouldRunByInterval(lastCheckedAt, intervalMinutes, now = Date.now()) {
  const last = Number(lastCheckedAt) || 0;
  return now - last >= minutesToMs(intervalMinutes);
}

export function shouldNotifyByInterval(lastSentAt, intervalMinutes, now = Date.now()) {
  const last = Number(lastSentAt) || 0;
  return now - last >= minutesToMs(intervalMinutes);
}

export function getAlertChannels(alert, notificationConfig) {
  const perAlert = parseChannels(alert?.channels);
  if (perAlert?.length) return perAlert.filter((channel) => channel !== 'browser');
  return [
    notificationConfig.emailEnabled ? 'email' : null,
    notificationConfig.feishuEnabled ? 'feishu' : null,
  ].filter(Boolean);
}

export function buildAlertNotification(alert, price) {
  const name = alert.asset_id || alert.symbol;
  return {
    title: `价格提醒触发：${name}`,
    body: [
      `${name} 当前价格 ${price}`,
      `条件：${conditionLabel(alert.condition)} ${Number(alert.target_price)}`,
      alert.note ? `备注：${alert.note}` : '',
    ].filter(Boolean).join('\n'),
  };
}
