import { fetchYahooChart, toPercent } from './_lib/yahoo.js';

export const config = {
  maxDuration: 20,
};

const SNAPSHOT_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const snapshotCache = globalThis.__INVEST_BRAIN_STOCK_SNAPSHOT_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_STOCK_SNAPSHOT_CACHE__ = snapshotCache;

const last = (items) => items[items.length - 1];

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function standardDeviation(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function simpleMovingAverage(values, period) {
  if (values.length < period) return null;
  return average(values.slice(-period));
}

function periodReturn(closes, period) {
  if (closes.length <= period) return null;
  const end = last(closes);
  const start = closes[closes.length - 1 - period];
  if (!start || !end) return null;
  return end / start - 1;
}

function maxDrawdown(closes) {
  let peak = -Infinity;
  let drawdown = 0;

  for (const close of closes) {
    if (!Number.isFinite(close) || close <= 0) continue;
    peak = Math.max(peak, close);
    if (peak > 0) {
      drawdown = Math.min(drawdown, close / peak - 1);
    }
  }

  return drawdown;
}

function normalizeChart(result) {
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const closes = [];
  const volumes = [];
  const rows = [];

  timestamps.forEach((timestamp, index) => {
    const close = Number(quote.close?.[index]);
    if (!Number.isFinite(close) || close <= 0) return;

    const volume = Number(quote.volume?.[index]);
    closes.push(close);
    volumes.push(Number.isFinite(volume) ? volume : null);
    rows.push({
      timestamp,
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close,
      volume: Number.isFinite(volume) ? volume : null,
    });
  });

  return { closes, volumes, rows };
}

function getRiskLevel({ annualizedVolatility, drawdown }) {
  const vol = annualizedVolatility ?? 0;
  const dd = Math.abs(drawdown ?? 0);
  if (vol >= 0.45 || dd >= 0.35) return 'HIGH';
  if (vol >= 0.28 || dd >= 0.2) return 'MEDIUM';
  return 'LOW';
}

function getTrendLabel({ price, sma50, sma200, return3m }) {
  if (!price || !sma50) return 'INSUFFICIENT_DATA';
  if (sma200 && price > sma50 && price > sma200 && (return3m ?? 0) >= 0) return 'UPTREND';
  if (sma200 && price < sma50 && price < sma200 && (return3m ?? 0) <= 0) return 'DOWNTREND';
  if (price > sma50) return 'RECOVERING';
  if (price < sma50) return 'WEAKENING';
  return 'RANGE_BOUND';
}

function buildSnapshot(symbol, dailyResult, intradayResult) {
  const dailyMeta = dailyResult.meta || {};
  const intradayMeta = intradayResult.meta || {};
  const { closes, volumes, rows } = normalizeChart(dailyResult);

  if (!closes.length) {
    throw new Error('No usable close data found');
  }

  const latestPrice = intradayMeta.regularMarketPrice ?? dailyMeta.regularMarketPrice ?? last(closes) ?? null;
  const previousClose = intradayMeta.chartPreviousClose ?? null;
  const dayChange = latestPrice !== null && previousClose ? latestPrice - previousClose : null;
  const dayChangePct = latestPrice !== null && previousClose ? latestPrice / previousClose - 1 : null;
  const high52 = dailyMeta.fiftyTwoWeekHigh ?? Math.max(...closes);
  const low52 = dailyMeta.fiftyTwoWeekLow ?? Math.min(...closes);
  const week52Position = high52 > low52 && latestPrice !== null
    ? (latestPrice - low52) / (high52 - low52)
    : null;
  const returns = closes.slice(1).map((close, index) => close / closes[index] - 1);
  const dailyVolatility = standardDeviation(returns);
  const annualizedVolatility = dailyVolatility === null ? null : dailyVolatility * Math.sqrt(252);
  const drawdown = maxDrawdown(closes);
  const avgVolume20 = average(volumes.slice(-20));
  const latestVolume = intradayMeta.regularMarketVolume ?? last(volumes) ?? null;
  const volumeRatio20 = latestVolume && avgVolume20 ? latestVolume / avgVolume20 : null;
  const sma50 = simpleMovingAverage(closes, 50);
  const sma200 = simpleMovingAverage(closes, 200);
  const return1m = periodReturn(closes, 21);
  const return3m = periodReturn(closes, 63);
  const return6m = periodReturn(closes, 126);
  const return1y = closes.length > 1 && latestPrice !== null ? latestPrice / closes[0] - 1 : null;
  const trend = getTrendLabel({ price: latestPrice, sma50, sma200, return3m });
  const risk = getRiskLevel({ annualizedVolatility, drawdown });

  return {
    success: true,
    symbol: String(symbol || '').toUpperCase(),
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'Yahoo Finance chart',
      range: '1y',
      interval: '1d',
    },
    meta: {
      name: dailyMeta.longName || dailyMeta.shortName || intradayMeta.longName || intradayMeta.shortName || symbol,
      currency: dailyMeta.currency || intradayMeta.currency || 'USD',
      exchangeName: dailyMeta.exchangeName || intradayMeta.exchangeName || null,
      instrumentType: dailyMeta.instrumentType || intradayMeta.instrumentType || null,
      latestDate: last(rows)?.date || null,
      observations: closes.length,
    },
    quote: {
      price: latestPrice,
      previousClose,
      dayChange,
      dayChangePct: toPercent(dayChangePct),
      dayHigh: intradayMeta.regularMarketDayHigh ?? null,
      dayLow: intradayMeta.regularMarketDayLow ?? null,
      dayOpen: intradayMeta.regularMarketOpen ?? null,
      dayVolume: latestVolume,
    },
    metrics: {
      return1m: toPercent(return1m),
      return3m: toPercent(return3m),
      return6m: toPercent(return6m),
      return1y: toPercent(return1y),
      annualizedVolatility: toPercent(annualizedVolatility),
      maxDrawdown: toPercent(drawdown),
      sma50,
      sma200,
      high52,
      low52,
      week52Position: toPercent(week52Position),
      avgVolume20,
      volumeRatio20,
      trend,
      risk,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const cacheKey = String(symbol).trim().toUpperCase();
    const cached = snapshotCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.setHeader('X-IB-Stock-Snapshot-Cache', 'hit');
      return res.status(200).json(cached.payload);
    }

    const [daily, intraday] = await Promise.all([
      fetchYahooChart(symbol, { interval: '1d', range: '1y', timeoutMs: SNAPSHOT_TIMEOUT_MS }),
      fetchYahooChart(symbol, { interval: '1d', range: '1d', timeoutMs: SNAPSHOT_TIMEOUT_MS }),
    ]);
    const payload = buildSnapshot(symbol, daily.result, intraday.result);

    snapshotCache.set(cacheKey, {
      fetchedAt: Date.now(),
      payload,
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-IB-Stock-Snapshot-Cache', 'miss');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Stock Snapshot Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
