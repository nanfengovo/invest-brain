import { buildAlertNotification, getAlertChannels, normalizeCloudAlertPayload, shouldNotifyByInterval, shouldRunByInterval, shouldTrigger, toFiniteNumber } from './_lib/alertRules.js';
import { createRedisClient, parseRedisJson } from './_lib/redis.js';
import { fetchYahooChart, fetchWithTimeout, YAHOO_HEADERS } from './_lib/yahoo.js';
import { sendFeishu, sendResendEmail } from './notify.js';
import optionsChainHandler from './options-chain.js';

export const config = {
  maxDuration: 60,
};

function hasCronAccess(req) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) return true;
  const authHeader = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const querySecret = new URL(req.url, `http://${req.headers.host}`).searchParams.get('secret') || '';
  return authHeader === cronSecret || querySecret === cronSecret;
}

function getYahooOptionExpiration(contractSymbol) {
  const match = String(contractSymbol || '').toUpperCase().match(/^[A-Z.]+(\d{6})[CP]\d{8}$/);
  if (!match) return null;
  const yymmdd = match[1];
  const year = Number(`20${yymmdd.slice(0, 2)}`);
  const month = yymmdd.slice(2, 4);
  const day = yymmdd.slice(4, 6);
  const timestamp = Date.parse(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

async function fetchStockPrice(symbol) {
  const { result } = await fetchYahooChart(symbol, {
    interval: '1d',
    range: '1d',
    timeoutMs: 4_500,
  });
  const meta = result?.meta || {};
  const price = toFiniteNumber(meta.regularMarketPrice);
  if (price === null) throw new Error(`No stock price for ${symbol}`);
  return price;
}

async function fetchYahooOptionPrice(alert) {
  const expiration = getYahooOptionExpiration(alert.asset_id);
  const params = expiration ? `?date=${expiration}` : '';
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(alert.symbol)}${params}`;
  const response = await fetchWithTimeout(url, { headers: YAHOO_HEADERS }, 5_000);
  if (!response.ok) {
    throw new Error(`Yahoo options responded with ${response.status}`);
  }

  const json = await response.json();
  const result = json.optionChain?.result?.[0];
  const chain = result?.options?.[0] || {};
  const options = [...(chain.calls || []), ...(chain.puts || [])];
  const match = options.find((item) => item.contractSymbol === alert.asset_id);
  if (!match) throw new Error(`No option quote for ${alert.asset_id}`);

  const bid = toFiniteNumber(match.bid);
  const ask = toFiniteNumber(match.ask);
  const last = toFiniteNumber(match.lastPrice);
  if (bid !== null && ask !== null && ask >= bid) {
    return Number(((bid + ask) / 2).toFixed(4));
  }
  if (last !== null) return last;
  throw new Error(`No option price for ${alert.asset_id}`);
}

function createOptionsChainResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function fetchConfiguredOptionPrice(alert, marketDataConfig = {}) {
  const params = new URLSearchParams({
    symbol: alert.symbol,
    provider: marketDataConfig.optionProvider || 'auto',
    contract: alert.asset_id,
  });
  const req = {
    method: 'GET',
    url: `/api/options-chain?${params.toString()}`,
    headers: {
      host: 'localhost',
      ...(marketDataConfig.marketDataToken ? { 'x-marketdata-token': marketDataConfig.marketDataToken } : {}),
      ...(marketDataConfig.tradierToken ? { 'x-tradier-token': marketDataConfig.tradierToken } : {}),
      ...(marketDataConfig.polygonToken ? { 'x-polygon-token': marketDataConfig.polygonToken } : {}),
      ...(marketDataConfig.longbridgeAppKey ? { 'x-longbridge-app-key': marketDataConfig.longbridgeAppKey } : {}),
      ...(marketDataConfig.longbridgeAppSecret ? { 'x-longbridge-app-secret': marketDataConfig.longbridgeAppSecret } : {}),
      ...(marketDataConfig.longbridgeAccessToken ? { 'x-longbridge-access-token': marketDataConfig.longbridgeAccessToken } : {}),
      ...(marketDataConfig.longbridgeBridgeUrl ? { 'x-longbridge-bridge-url': marketDataConfig.longbridgeBridgeUrl } : {}),
      ...(marketDataConfig.longbridgeBridgeToken ? { 'x-longbridge-bridge-token': marketDataConfig.longbridgeBridgeToken } : {}),
    },
  };
  const res = createOptionsChainResponse();
  await optionsChainHandler(req, res);

  if (res.statusCode >= 400) {
    throw new Error(res.body?.error || '期权行情加载失败');
  }

  const match = (res.body?.options || []).find((item) => item.contractSymbol === alert.asset_id);
  const bid = toFiniteNumber(match?.bid);
  const ask = toFiniteNumber(match?.ask);
  const mark = toFiniteNumber(match?.mark);
  const last = toFiniteNumber(match?.last);

  if (mark !== null) return mark;
  if (bid !== null && ask !== null && ask >= bid) return Number(((bid + ask) / 2).toFixed(4));
  if (last !== null) return last;
  throw new Error(`No option price for ${alert.asset_id}`);
}

async function fetchAlertPrice(alert, marketDataConfig = {}) {
  if (alert.asset_type === 'OPTION') {
    try {
      return await fetchConfiguredOptionPrice(alert, marketDataConfig);
    } catch (error) {
      if (marketDataConfig.optionProvider && marketDataConfig.optionProvider !== 'auto') throw error;
      return fetchYahooOptionPrice(alert);
    }
  }
  return fetchStockPrice(alert.symbol);
}

async function sendAlert(alert, price, notificationConfig) {
  const channels = getAlertChannels(alert, notificationConfig);
  if (!channels.length) return { skipped: true, reason: 'no_channels' };

  const { title, body } = buildAlertNotification(alert, price);
  const result = {};

  if (channels.includes('feishu')) {
    result.feishu = await sendFeishu(notificationConfig.feishuWebhook, title, body);
  }

  if (channels.includes('email')) {
    result.email = await sendResendEmail({
      apiKey: notificationConfig.emailApiKey,
      from: notificationConfig.emailFrom,
      to: notificationConfig.emailTo,
    }, title, body);
  }

  return result;
}

function hasSuccessfulDelivery(result) {
  return Object.values(result || {}).some((item) => item?.ok);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!hasCronAccess(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let redis;
  const summary = {
    users: 0,
    usersChecked: 0,
    alertsChecked: 0,
    triggered: 0,
    notified: 0,
    skippedByInterval: 0,
    errors: [],
  };

  try {
    const now = Date.now();
    redis = await createRedisClient();
    const keys = await redis.keys('alert_config:*');
    summary.users = keys.length;

    if (!keys.length) {
      return res.status(200).json({ success: true, summary });
    }

    const values = await redis.mget(keys);
    const configs = values
      .map(parseRedisJson)
      .map((item) => normalizeCloudAlertPayload(item || {}))
      .filter((item) => item.userId);

    for (const config of configs) {
      const interval = config.notificationConfig.alertCheckIntervalMinutes;
      const lastCheckKey = `alert_check:${config.userId}`;
      const lastCheckedAt = await redis.get(lastCheckKey);

      if (!shouldRunByInterval(lastCheckedAt, interval, now)) {
        summary.skippedByInterval += 1;
        continue;
      }

      await redis.set(lastCheckKey, String(now));
      summary.usersChecked += 1;

      for (const alert of config.alerts) {
        try {
          const price = await fetchAlertPrice(alert, config.marketDataConfig);
          summary.alertsChecked += 1;

          if (!shouldTrigger(alert, price)) continue;
          summary.triggered += 1;

          const sentKey = `alert_sent:${config.userId}:${alert.id}`;
          const lastSentAt = await redis.get(sentKey);
          if (!shouldNotifyByInterval(lastSentAt, interval, now)) continue;

          const delivery = await sendAlert(alert, price, config.notificationConfig);
          if (hasSuccessfulDelivery(delivery)) {
            await redis.set(sentKey, String(now));
            summary.notified += 1;
          }
        } catch (error) {
          summary.errors.push({
            userId: config.userId,
            alertId: alert.id,
            symbol: alert.asset_id || alert.symbol,
            error: error.message,
          });
        }
      }
    }

    return res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error('Alerts Cron Error:', error);
    return res.status(500).json({ error: error.message, summary });
  } finally {
    if (redis) await redis.close();
  }
}
