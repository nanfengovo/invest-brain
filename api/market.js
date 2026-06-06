import { fetchYahooChart } from './_lib/yahoo.js';

const CACHE_TTL_MS = 5_000;
const STALE_TTL_MS = 30_000;
const YAHOO_TIMEOUT_MS = 2_600;
const YAHOO_EXTENDED_TIMEOUT_MS = 4_500;

const marketCache = globalThis.__INVEST_BRAIN_MARKET_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_MARKET_CACHE__ = marketCache;

const getCachedQuote = (symbol, now, maxAge = CACHE_TTL_MS) => {
  const cached = marketCache.get(symbol);
  if (!cached || now - cached.fetchedAt > maxAge) return null;
  return cached.data;
};

const getChange = (price, previousClose) => {
  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose === 0) {
    return { absChange: null, pctChange: null };
  }

  const absChange = price - previousClose;
  return {
    absChange,
    pctChange: (absChange / previousClose) * 100,
  };
};

const findExtendedQuote = (result, previousClose) => {
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

  const { absChange, pctChange } = getChange(latest.price, previousClose);
  return {
    session: latest.session,
    label: latest.session === 'pre' ? '盘前' : '盘后',
    price: latest.price,
    absChange,
    pctChange,
    time: latest.timestamp,
  };
};

const fetchExtendedQuote = async (originalSymbol, previousClose) => {
  try {
    const { result } = await fetchYahooChart(originalSymbol, {
      interval: '1m',
      range: '1d',
      includePrePost: true,
      timeoutMs: YAHOO_EXTENDED_TIMEOUT_MS,
    });

    return findExtendedQuote(result, previousClose);
  } catch {
    return null;
  }
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
    ? await fetchExtendedQuote(originalSymbol, previousClose)
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
    type: originalSymbol.startsWith('hf_') ? 'futures' : 'us',
  };
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
    const now = Date.now();
    const pendingSymbols = [];

    for (const symbol of symbolsArray) {
      const cacheKey = includeExtended ? `${symbol}::extended` : `${symbol}::regular`;
      const fresh = getCachedQuote(cacheKey, now);
      if (fresh) {
        results[symbol] = fresh;
        continue;
      }

      const stale = getCachedQuote(cacheKey, now, STALE_TTL_MS);
      if (stale) {
        results[symbol] = stale;
      }
      pendingSymbols.push({ symbol, cacheKey });
    }

    const promises = pendingSymbols.map(async ({ symbol: originalSymbol, cacheKey }) => {
      try {
        const quote = await fetchQuote(originalSymbol, { includeExtended });
        if (!quote) return;

        marketCache.set(cacheKey, {
          fetchedAt: Date.now(),
          data: quote,
        });
        results[originalSymbol] = quote;
      } catch (err) {
        // Return any stale quote already placed in results and skip only this symbol.
      }
    });

    await Promise.all(promises);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
    res.setHeader('X-IB-Market-Duration', String(Date.now() - startedAt));
    res.setHeader('X-IB-Market-Pending', String(pendingSymbols.length));

    return res.status(200).json({
      success: true,
      data: results,
      meta: {
        requested: symbolsArray.length,
        refreshed: pendingSymbols.length,
        durationMs: Date.now() - startedAt,
      },
    });

  } catch (error) {
    console.error('Market Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
