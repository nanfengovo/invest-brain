import { fetchWithTimeout, fetchYahooChart, YAHOO_HEADERS } from './_lib/yahoo.js';
import {
  fetchLongbridgeCandlesticks,
  getLongbridgeCredentials,
  hasLongbridgeCredentials,
} from './_lib/longbridge.js';

const KLINE_TIMEOUT_MS = 4_500;
const STOOQ_KLINE_TIMEOUT_MS = 4_500;
const KLINE_CACHE_VERSION = 'real-ohlc-v3-yearly';
const klineCache = globalThis.__INVEST_BRAIN_KLINE_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_KLINE_CACHE__ = klineCache;

const isIntradayInterval = (interval) => /^\d+(m|h)$/i.test(String(interval || '').trim());

const getCacheTtl = (interval) => {
  if (isIntradayInterval(interval)) return 10_000;
  return 180_000;
};

const formatDate = (timestamp, interval) => {
  const date = new Date(timestamp * 1000);
  return isIntradayInterval(interval)
    ? `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    : `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

const normalizeYahooKline = (result, interval) => {
  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};

  return timestamps.map((ts, i) => [
    formatDate(ts, interval),
    Number(quotes.open?.[i]) || 0,
    Number(quotes.close?.[i]) || 0,
    Number(quotes.low?.[i]) || 0,
    Number(quotes.high?.[i]) || 0,
    Number(quotes.volume?.[i]) || 0,
  ]).filter((item) => item[1] !== 0 && item[2] !== 0);
};

const toStooqSymbol = (symbol) => {
  const clean = String(symbol || '').trim();
  if (!clean) return '';
  const normalized = clean.replace(/^(gb_|us|stock_)/i, '').toLowerCase();
  if (/^hf_/i.test(clean)) return '';
  if (normalized.startsWith('^')) return normalized;
  if (/^\d{5}$/.test(normalized)) return `${normalized}.hk`;
  if (/\.(us|hk|cn|sh|sz)$/i.test(normalized)) return normalized;
  return `${normalized}.us`;
};

const getRangeLimit = (range) => {
  const text = String(range || '').toLowerCase();
  if (text === '1d' || text === '5d') return 5;
  if (text === '1mo') return 25;
  if (text === '3mo') return 66;
  if (text === '6mo') return 132;
  if (text === '1y') return 260;
  if (text === '2y') return 520;
  if (text === '5y') return 1300;
  if (text === '10y') return 2600;
  return 260;
};

const parseCsvRows = (text = '') => String(text || '')
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.split(',').map((value) => value.trim()));

const fetchStooqKline = async (symbol, { range }) => {
  const stooqSymbol = toStooqSymbol(symbol);
  if (!stooqSymbol) return null;

  const url = new URL('https://stooq.com/q/d/l/');
  url.searchParams.set('s', stooqSymbol);
  url.searchParams.set('i', 'd');
  const response = await fetchWithTimeout(url.toString(), { headers: YAHOO_HEADERS }, STOOQ_KLINE_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Stooq K 线响应 ${response.status}`);
  }

  const rows = parseCsvRows(await response.text())
    .slice(1)
    .filter((row) => row.length >= 6 && !row.some((value) => /^N\/D$/i.test(value)));
  const data = rows.map(([date, open, high, low, close, volume]) => [
    date,
    Number(open),
    Number(close),
    Number(low),
    Number(high),
    Number(volume) || 0,
  ]).filter((item) => item.slice(1, 5).every((value) => Number.isFinite(value) && value > 0));

  const clipped = data.slice(-getRangeLimit(range));
  if (!clipped.length) return null;

  return {
    success: true,
    meta: {
      symbol,
      currency: stooqSymbol.endsWith('.hk') ? 'HKD' : 'USD',
      exchangeName: 'Stooq',
      dataSource: 'Stooq delayed daily',
      chartPreviousClose: clipped.length > 1 ? clipped.at(-2)?.[2] : null,
      regularMarketPrice: clipped.at(-1)?.[2] ?? null,
      regularMarketDayHigh: clipped.at(-1)?.[4] ?? null,
      regularMarketDayLow: clipped.at(-1)?.[3] ?? null,
      regularMarketOpen: clipped.at(-1)?.[1] ?? null,
      regularMarketVolume: clipped.at(-1)?.[5] ?? null,
    },
    data: clipped,
    dataSource: {
      provider: 'Stooq delayed daily',
      realtime: false,
      fallback: true,
      note: 'Yahoo 实时 K 线不可用，当前使用 Stooq 延迟日线兜底，仅用于趋势参考。',
      schema: KLINE_CACHE_VERSION,
    },
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbol = searchParams.get('symbol');
    // interval: 1m, 5m, 15m, 1d, 1wk, 1mo
    const interval = searchParams.get('interval') || '1d';
    // range: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    const range = searchParams.get('range') || '1mo';
    const longbridgeCredentials = getLongbridgeCredentials(req.headers || {});

    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const cacheKey = `${KLINE_CACHE_VERSION}|${symbol.toUpperCase()}|${interval}|${range}`;
    const cached = klineCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= getCacheTtl(interval)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.setHeader('X-IB-Kline-Cache', 'hit');
      return res.status(200).json(cached.payload);
    }

    let payload;
    try {
      const { result } = await fetchYahooChart(symbol, { interval, range, timeoutMs: KLINE_TIMEOUT_MS });
      payload = {
        success: true,
        meta: result.meta,
        data: normalizeYahooKline(result, interval),
        dataSource: {
          provider: 'Yahoo Finance chart',
          realtime: isIntradayInterval(interval),
          fallback: false,
          schema: KLINE_CACHE_VERSION,
        },
      };
    } catch (yahooError) {
      let longbridgePayload = null;
      let longbridgeError = null;
      if (hasLongbridgeCredentials(longbridgeCredentials)) {
        try {
          longbridgePayload = await fetchLongbridgeCandlesticks(symbol, longbridgeCredentials, { interval, range });
        } catch (error) {
          longbridgeError = error;
        }
      }
      if (longbridgePayload) {
        payload = {
          ...longbridgePayload,
          dataSource: {
            ...(longbridgePayload.dataSource || {}),
            fallbackFrom: 'Yahoo Finance chart',
            fallbackReason: yahooError?.message || 'Yahoo K 线不可用',
          },
        };
      } else {
        let stooqPayload = null;
        let stooqError = null;
        try {
          stooqPayload = await fetchStooqKline(symbol, { range });
        } catch (error) {
          stooqError = error;
        }
        if (!stooqPayload) {
          const error = new Error(
            `Yahoo K 线失败：${yahooError?.message || '未知错误'}；长桥 K 线兜底失败：${longbridgeError?.message || '未配置或未返回可用数据'}；Stooq 兜底失败：${stooqError?.message || '未返回可用数据'}`
          );
          error.yahooError = yahooError;
          error.longbridgeError = longbridgeError;
          error.stooqError = stooqError;
          throw error;
        }
        payload = {
          ...stooqPayload,
          dataSource: {
            ...(stooqPayload.dataSource || {}),
            fallbackFrom: 'Yahoo Finance chart',
            fallbackReason: yahooError?.message || 'Yahoo K 线不可用',
          },
        };
      }
    }

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('X-IB-Kline-Cache', 'miss');

    klineCache.set(cacheKey, {
      fetchedAt: Date.now(),
      payload,
    });

    return res.status(200).json(payload);

  } catch (error) {
    console.error('Kline Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
