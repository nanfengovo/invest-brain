import { fetchWithTimeout, fetchYahooChart, YAHOO_HEADERS } from './_lib/yahoo.js';
import { getMarketRegion, normalizeYahooMarketSymbol } from './_lib/marketSymbols.js';
import {
  fetchLongbridgeMarketQuote,
  getLongbridgeCredentials,
  hasLongbridgeCredentials,
} from './_lib/longbridge.js';

const CACHE_TTL_MS = 5_000;
const STALE_TTL_MS = 30_000;
const YAHOO_TIMEOUT_MS = 2_600;
const YAHOO_EXTENDED_TIMEOUT_MS = 4_500;
const STOOQ_TIMEOUT_MS = 4_500;

const marketCache = globalThis.__INVEST_BRAIN_MARKET_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_MARKET_CACHE__ = marketCache;
const pendingMarketRefreshes = globalThis.__INVEST_BRAIN_MARKET_PENDING__ || new Map();
globalThis.__INVEST_BRAIN_MARKET_PENDING__ = pendingMarketRefreshes;

const getCachedQuote = (symbol, now, maxAge = CACHE_TTL_MS) => {
  const cached = marketCache.get(symbol);
  if (!cached || now - cached.fetchedAt > maxAge) return null;
  return cached.data;
};

export const getChange = (price, referencePrice) => {
  if (!Number.isFinite(price) || !Number.isFinite(referencePrice) || referencePrice === 0) {
    return { absChange: null, pctChange: null };
  }

  const absChange = price - referencePrice;
  return {
    absChange,
    pctChange: (absChange / referencePrice) * 100,
  };
};

export const findExtendedQuote = (result, referencePrice) => {
  const meta = result?.meta || {};
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const periods = meta.currentTradingPeriod || {};
  const rows = [];

  timestamps.forEach((timestamp, index) => {
    const close = Number(quote.close?.[index]);
    if (!Number.isFinite(close) || close <= 0) return;

    const isPre = timestamp >= periods.pre?.start && timestamp <= periods.pre?.end;
    const isPost = timestamp >= periods.post?.start && timestamp <= periods.post?.end;
    if (!isPre && !isPost) return;

    rows.push({
      timestamp,
      session: isPre ? 'pre' : 'post',
      price: close,
    });
  });

  const latest = rows.at(-1);
  if (!latest) return null;

  const { absChange, pctChange } = getChange(latest.price, referencePrice);
  return {
    session: latest.session,
    label: latest.session === 'pre' ? '盘前' : '盘后',
    price: latest.price,
    absChange,
    pctChange,
    time: latest.timestamp,
  };
};

const fetchExtendedQuote = async (originalSymbol, referencePrice) => {
  try {
    const { result } = await fetchYahooChart(originalSymbol, {
      interval: '1m',
      range: '1d',
      includePrePost: true,
      timeoutMs: YAHOO_EXTENDED_TIMEOUT_MS,
    });

    return findExtendedQuote(result, referencePrice);
  } catch {
    return null;
  }
};

const toStooqSymbol = (symbol) => {
  const clean = String(symbol || '').trim();
  if (!clean) return '';
  const normalized = normalizeYahooMarketSymbol(clean).toLowerCase();
  if (/^hf_/i.test(clean)) return '';
  if (normalized.startsWith('^')) return normalized;
  if (/^\d{5}$/.test(normalized)) return `${normalized}.hk`;
  if (/\.(hk)$/i.test(normalized)) return normalized;
  if (/\.(ss|sz|cn|sh)$/i.test(normalized)) return '';
  if (/\.(us)$/i.test(normalized)) return normalized;
  return `${normalized}.us`;
};

const parseCsvRows = (text = '') => {
  return String(text || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(',').map((value) => value.trim()));
};

const fetchStooqQuote = async (originalSymbol) => {
  const stooqSymbol = toStooqSymbol(originalSymbol);
  if (!stooqSymbol) return null;

  const url = new URL('https://stooq.com/q/d/l/');
  url.searchParams.set('s', stooqSymbol);
  url.searchParams.set('i', 'd');
  const response = await fetchWithTimeout(url.toString(), { headers: YAHOO_HEADERS }, STOOQ_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Stooq 行情响应 ${response.status}`);
  }

  const rows = parseCsvRows(await response.text());
  const dataRows = rows.slice(1).filter((row) => row.length >= 6 && !row.some((value) => /^N\/D$/i.test(value)));
  const latest = dataRows.at(-1);
  const previous = dataRows.length > 1 ? dataRows.at(-2) : null;
  if (!latest) return null;

  const [date, open, high, low, close, volume] = latest;
  const price = Number(close);
  const previousClose = previous ? Number(previous[4]) : null;
  if (!Number.isFinite(price)) return null;

  const { absChange, pctChange } = getChange(price, previousClose);
  const cleanSymbol = String(originalSymbol || '').replace(/^(gb_|us|stock_)/i, '').toUpperCase();
  const region = getMarketRegion(originalSymbol);
  return {
    symbol: originalSymbol,
    name: cleanSymbol,
    price,
    regularMarketPrice: price,
    displayPrice: price,
    pctChange,
    absChange,
    displayPctChange: pctChange,
    displayAbsChange: absChange,
    prevClose: Number.isFinite(previousClose) ? previousClose : null,
    extendedMarket: null,
    hasPrePostMarketData: false,
    regularMarketDayHigh: Number.isFinite(Number(high)) ? Number(high) : null,
    regularMarketDayLow: Number.isFinite(Number(low)) ? Number(low) : null,
    regularMarketOpen: Number.isFinite(Number(open)) ? Number(open) : null,
    regularMarketVolume: Number.isFinite(Number(volume)) ? Number(volume) : null,
    currency: region === 'HK' ? 'HKD' : 'USD',
    exchangeName: 'Stooq',
    instrumentType: null,
    yahooSymbol: cleanSymbol,
    type: region.toLowerCase(),
    provider: 'Stooq delayed daily',
    timestamp: date || null,
    fallbackFrom: 'Yahoo Finance',
    fallbackReason: 'Yahoo 实时行情暂不可用，使用 Stooq 日线兜底。',
  };
};

const fetchQuote = async (originalSymbol, { includeExtended = false } = {}) => {
  const { result, yahooSymbol } = await fetchYahooChart(originalSymbol, {
    interval: '1d',
    range: '1d',
    timeoutMs: YAHOO_TIMEOUT_MS,
  });
  const meta = result?.meta;

  if (!meta) return null;

  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose);
  const regularPrice = Number.isFinite(price) ? price : null;
  const previousClose = Number.isFinite(prevClose) ? prevClose : null;
  const { absChange, pctChange } = getChange(regularPrice, previousClose);
  const extendedMarket = includeExtended && meta.hasPrePostMarketData
    ? await fetchExtendedQuote(originalSymbol, regularPrice)
    : null;
  const displayPrice = extendedMarket?.price ?? regularPrice;
  const displayAbsChange = extendedMarket?.absChange ?? absChange;
  const displayPctChange = extendedMarket?.pctChange ?? pctChange;

  return {
    symbol: originalSymbol,
    name: meta.shortName || meta.longName || yahooSymbol,
    price: regularPrice,
    regularMarketPrice: regularPrice,
    displayPrice,
    pctChange,
    absChange,
    displayPctChange,
    displayAbsChange,
    prevClose: previousClose,
    extendedMarket,
    hasPrePostMarketData: Boolean(meta.hasPrePostMarketData),
    regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
    regularMarketDayLow: meta.regularMarketDayLow ?? null,
    regularMarketOpen: meta.regularMarketOpen ?? null,
    regularMarketVolume: meta.regularMarketVolume ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    currency: meta.currency || 'USD',
    exchangeName: meta.exchangeName || null,
    instrumentType: meta.instrumentType || null,
    yahooSymbol,
    type: getMarketRegion(originalSymbol).toLowerCase(),
  };
};

const fetchQuoteWithFallback = async (originalSymbol, { includeExtended = false, longbridgeCredentials = null } = {}) => {
  try {
    return await fetchQuote(originalSymbol, { includeExtended });
  } catch (yahooError) {
    let stooqFailure = null;
    try {
      const stooqQuote = await fetchStooqQuote(originalSymbol);
      if (stooqQuote) {
        return {
          ...stooqQuote,
          fallbackReason: yahooError?.message
            ? `Yahoo 行情失败：${yahooError.message}；已使用 Stooq 延迟日线兜底。`
          : stooqQuote.fallbackReason,
        };
      }
    } catch (error) {
      stooqFailure = error;
      if (!hasLongbridgeCredentials(longbridgeCredentials)) {
        const error = new Error(
          `Yahoo 行情失败：${yahooError?.message || '未知错误'}；Stooq 兜底失败：${stooqFailure?.message || '未知错误'}`
        );
        error.yahooError = yahooError;
        error.stooqError = stooqFailure;
        throw error;
      }
    }

    if (hasLongbridgeCredentials(longbridgeCredentials)) {
      try {
        const longbridgeQuote = await fetchLongbridgeMarketQuote(originalSymbol, longbridgeCredentials);
        if (longbridgeQuote) {
          return {
            ...longbridgeQuote,
            fallbackFrom: 'Yahoo Finance',
            fallbackReason: yahooError?.message || 'Yahoo 行情暂不可用',
          };
        }
      } catch (longbridgeError) {
        const error = new Error(
          `Yahoo 行情失败：${yahooError?.message || '未知错误'}；Stooq 兜底失败：${stooqFailure?.message || '未返回可用数据'}；长桥兜底失败：${longbridgeError?.message || '未知错误'}`
        );
        error.yahooError = yahooError;
        error.stooqError = stooqFailure;
        error.longbridgeError = longbridgeError;
        throw error;
      }
    }

    throw yahooError;
  }
};

const refreshMarketQuote = async (originalSymbol, cacheKey, { includeExtended = false, longbridgeCredentials = null } = {}) => {
  if (pendingMarketRefreshes.has(cacheKey)) {
    return pendingMarketRefreshes.get(cacheKey);
  }

  const promise = (async () => {
    const quote = await fetchQuoteWithFallback(originalSymbol, { includeExtended, longbridgeCredentials });
    if (quote) {
      marketCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data: quote,
      });
    }
    return quote;
  })().finally(() => {
    pendingMarketRefreshes.delete(cacheKey);
  });

  pendingMarketRefreshes.set(cacheKey, promise);
  return promise;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const startedAt = Date.now();
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return res.status(400).json({ error: 'Missing symbols parameter' });
    }

    const includeExtended = ['1', 'true', 'yes'].includes(
      String(searchParams.get('extended') || '').toLowerCase()
    );
    const symbolsArray = Array.from(
      new Set(
        symbolsParam
          .split(',')
          .map((symbol) => symbol.trim())
          .filter(Boolean)
      )
    );
    const results = {};
    const errors = {};
    const now = Date.now();
    const pendingSymbols = [];
    const backgroundSymbols = [];
    const longbridgeCredentials = getLongbridgeCredentials(req.headers || {});
    const credentialKey = hasLongbridgeCredentials(longbridgeCredentials) ? ':lb' : ':no-lb';

    for (const symbol of symbolsArray) {
      const cacheKey = `${symbol}::${includeExtended ? 'extended' : 'regular'}${credentialKey}`;
      const fresh = getCachedQuote(cacheKey, now);
      if (fresh) {
        results[symbol] = fresh;
        continue;
      }

      const stale = getCachedQuote(cacheKey, now, STALE_TTL_MS);
      if (stale) {
        results[symbol] = stale;
        backgroundSymbols.push({ symbol, cacheKey });
        continue;
      }
      pendingSymbols.push({ symbol, cacheKey });
    }

    const promises = pendingSymbols.map(async ({ symbol: originalSymbol, cacheKey }) => {
      try {
        const quote = await refreshMarketQuote(originalSymbol, cacheKey, { includeExtended, longbridgeCredentials });
        if (!quote) return;

        results[originalSymbol] = quote;
      } catch (err) {
        errors[originalSymbol] = err?.message || '行情请求失败';
        // Return any stale quote already placed in results and skip only this symbol.
      }
    });

    await Promise.all(promises);
    backgroundSymbols.forEach(({ symbol: originalSymbol, cacheKey }) => {
      refreshMarketQuote(originalSymbol, cacheKey, { includeExtended, longbridgeCredentials }).catch(() => {});
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
    res.setHeader('X-IB-Market-Duration', String(Date.now() - startedAt));
    res.setHeader('X-IB-Market-Pending', String(pendingSymbols.length));

    return res.status(200).json({
      success: true,
      data: results,
      errors,
      meta: {
        requested: symbolsArray.length,
        returned: Object.keys(results).length,
        refreshed: pendingSymbols.length,
        staleReturned: backgroundSymbols.length,
        longbridgeFallbackEnabled: hasLongbridgeCredentials(longbridgeCredentials),
        partial: Object.keys(results).length < symbolsArray.length,
        durationMs: Date.now() - startedAt,
      },
    });

  } catch (error) {
    console.error('Market Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
