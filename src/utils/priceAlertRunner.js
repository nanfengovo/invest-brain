import { db } from '../db/database';

function parseChannels(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function shouldTrigger(alert, price) {
  if (!Number.isFinite(price)) return false;
  const target = Number(alert.target_price);
  if (!Number.isFinite(target)) return false;
  if (alert.condition === 'ABOVE') return price >= target;
  if (alert.condition === 'BELOW') return price <= target;
  return false;
}

function conditionLabel(condition) {
  return condition === 'ABOVE' ? '高于或等于' : '低于或等于';
}

async function notify(alert, price, notificationConfig) {
  const title = `价格提醒触发：${alert.asset_id || alert.symbol}`;
  const body = [
    `${alert.asset_id || alert.symbol} 当前价格 ${price}`,
    `条件：${conditionLabel(alert.condition)} ${Number(alert.target_price)}`,
    alert.note ? `备注：${alert.note}` : '',
  ].filter(Boolean).join('\n');

  if (notificationConfig.browserEnabled && 'Notification' in window) {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  const channels = parseChannels(alert.channels) || [
    notificationConfig.emailEnabled ? 'email' : null,
    notificationConfig.feishuEnabled ? 'feishu' : null,
  ].filter(Boolean);

  if (!channels.length) return;

  await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body,
      channels,
      feishuWebhook: notificationConfig.feishuWebhook,
      email: {
        apiKey: notificationConfig.emailApiKey,
        from: notificationConfig.emailFrom,
        to: notificationConfig.emailTo,
      },
    }),
  });
}

async function fetchStockPrices(symbols) {
  if (!symbols.length) return {};
  const response = await fetch(`/api/market?symbols=${encodeURIComponent(symbols.join(','))}`);
  const json = await response.json();
  return json?.data || {};
}

async function fetchOptionPrice(alert, marketDataConfig) {
  const params = new URLSearchParams({
    symbol: alert.symbol,
    provider: marketDataConfig.optionProvider || 'auto',
    contract: alert.asset_id,
  });
  const response = await fetch(`/api/options-chain?${params.toString()}`, {
    headers: {
      ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
      ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
      ...(marketDataConfig.marketDataToken ? { 'X-MarketData-Token': marketDataConfig.marketDataToken } : {}),
      ...(marketDataConfig.longbridgeAppKey ? { 'X-Longbridge-App-Key': marketDataConfig.longbridgeAppKey } : {}),
      ...(marketDataConfig.longbridgeAppSecret ? { 'X-Longbridge-App-Secret': marketDataConfig.longbridgeAppSecret } : {}),
      ...(marketDataConfig.longbridgeAccessToken ? { 'X-Longbridge-Access-Token': marketDataConfig.longbridgeAccessToken } : {}),
    },
  });
  const json = await response.json();
  const match = (json.options || []).find((item) => item.contractSymbol === alert.asset_id);
  return Number(match?.mark ?? match?.last);
}

export async function checkPriceAlerts(notificationConfig, marketDataConfig = {}, symbolFilter = null) {
  const alerts = (await db.getPriceAlerts('ACTIVE'))
    .filter((alert) => !symbolFilter || alert.symbol === String(symbolFilter).toUpperCase());
  const stockAlerts = alerts.filter((alert) => alert.asset_type !== 'OPTION');
  const optionAlerts = alerts.filter((alert) => alert.asset_type === 'OPTION');
  const symbols = Array.from(new Set(stockAlerts.map((alert) => alert.symbol)));
  const stockPrices = await fetchStockPrices(symbols);
  const triggered = [];

  for (const alert of stockAlerts) {
    const item = stockPrices[alert.symbol];
    const price = Number(item?.price);
    if (!shouldTrigger(alert, price)) {
      await db.updatePriceAlert(alert.id, { last_price: Number.isFinite(price) ? price : alert.last_price });
      continue;
    }
    await notify(alert, price, notificationConfig);
    await db.markPriceAlertTriggered(alert.id, price);
    triggered.push({ alert, price });
  }

  for (const alert of optionAlerts) {
    const price = await fetchOptionPrice(alert, marketDataConfig);
    if (!shouldTrigger(alert, price)) {
      await db.updatePriceAlert(alert.id, { last_price: Number.isFinite(price) ? price : alert.last_price });
      continue;
    }
    await notify(alert, price, notificationConfig);
    await db.markPriceAlertTriggered(alert.id, price);
    triggered.push({ alert, price });
  }

  return triggered;
}
