import {
  assertCronAuthorized,
  listServerAlertConfigs,
  updateServerAlertConfig,
} from './_lib/server-alerts.js';
import {
  buildAlertNotification,
  parseAlertChannels,
  shouldTriggerAlert,
  toNumber,
} from './_lib/price-alert-core.js';

export const config = {
  maxDuration: 60,
};

function absoluteUrl(req, path) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return `${protocol}://${req.headers.host}${path}`;
}

async function fetchStockPrices(req, symbols) {
  if (!symbols.length) return {};
  const url = absoluteUrl(req, `/api/market?symbols=${encodeURIComponent(symbols.join(','))}&extended=true`);
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '行情接口请求失败');
  return json.data || {};
}

async function fetchOptionPrice(req, alert, marketDataConfig = {}) {
  const params = new URLSearchParams({
    symbol: alert.symbol,
    provider: marketDataConfig.optionProvider || 'auto',
  });
  const url = absoluteUrl(req, `/api/options-chain?${params.toString()}`);
  const response = await fetch(url, {
    headers: {
      ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
      ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
    },
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '期权链接口请求失败');
  const match = (json.options || []).find((item) => item.contractSymbol === alert.asset_id);
  return toNumber(match?.mark ?? match?.last);
}

async function sendNotification(req, alert, price, notificationConfig = {}) {
  const channels = parseAlertChannels(alert.channels, notificationConfig).filter((channel) => channel !== 'browser');
  if (!channels.length) return { skipped: true };

  const { title, body } = buildAlertNotification(alert, price);
  const response = await fetch(absoluteUrl(req, '/api/notify'), {
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
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '通知发送失败');
  return json;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = assertCronAuthorized(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const startedAt = Date.now();

  try {
    const configs = await listServerAlertConfigs();
    const summary = {
      users: configs.length,
      checked: 0,
      triggered: 0,
      errors: [],
    };

    for (const userConfig of configs) {
      const alerts = Array.isArray(userConfig.alerts) ? userConfig.alerts : [];
      const activeAlerts = alerts.filter((alert) => String(alert.status || 'ACTIVE') === 'ACTIVE');
      const stockAlerts = activeAlerts.filter((alert) => alert.asset_type !== 'OPTION');
      const optionAlerts = activeAlerts.filter((alert) => alert.asset_type === 'OPTION');
      const stockSymbols = Array.from(new Set(stockAlerts.map((alert) => alert.symbol).filter(Boolean)));
      let stockPrices = {};

      try {
        stockPrices = await fetchStockPrices(req, stockSymbols);
      } catch (error) {
        summary.errors.push(`${userConfig.userId}: stock quotes failed: ${error.message}`);
      }

      for (const alert of stockAlerts) {
        const quote = stockPrices[alert.symbol] || {};
        const price = toNumber(quote.displayPrice ?? quote.price);
        summary.checked++;

        if (!shouldTriggerAlert(alert, price)) {
          alert.last_price = price ?? alert.last_price ?? null;
          continue;
        }

        await sendNotification(req, alert, price, userConfig.notificationConfig);
        alert.status = 'TRIGGERED';
        alert.last_price = price;
        alert.triggered_at = Math.floor(Date.now() / 1000);
        summary.triggered++;
      }

      for (const alert of optionAlerts) {
        summary.checked++;
        try {
          const price = await fetchOptionPrice(req, alert, userConfig.marketDataConfig);

          if (!shouldTriggerAlert(alert, price)) {
            alert.last_price = price ?? alert.last_price ?? null;
            continue;
          }

          await sendNotification(req, alert, price, userConfig.notificationConfig);
          alert.status = 'TRIGGERED';
          alert.last_price = price;
          alert.triggered_at = Math.floor(Date.now() / 1000);
          summary.triggered++;
        } catch (error) {
          summary.errors.push(`${userConfig.userId}: ${alert.asset_id || alert.symbol}: ${error.message}`);
        }
      }

      await updateServerAlertConfig(userConfig.userId, {
        ...userConfig,
        alerts,
        lastCheckedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      ...summary,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('Price Alert Cron Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
