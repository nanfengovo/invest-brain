import { fetchYahooChart } from './_lib/yahoo.js';

const CACHE_TTL_MS = 5_000;
const STALE_TTL_MS = 30_000;
const YAHOO_TIMEOUT_MS = 2_600;

const marketCache = globalThis.__INVEST_BRAIN_MARKET_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_MARKET_CACHE__ = marketCache;

const getCachedQuote = (symbol, now, maxAge = CACHE_TTL_MS) => {
  const cached = marketCache.get(symbol);
  if (!cached || now - cached.fetchedAt > maxAge) return null;
  return cached.data;
};

const fetchQuote = async (originalSymbol) => {
  const { result, yahooSymbol } = await fetchYahooChart(originalSymbol, {
    interval: '1d',
    range: '1d',
    timeoutMs: YAHOO_TIMEOUT_MS,
  });
  const meta = result?.meta;

  if (!meta) return null;

  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? 0;
  const absChange = price - prevClose;
  const pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : 0;

  return {
    symbol: originalSymbol,
    name: meta.shortName || meta.longName || yahooSymbol,
    price,
    pctChange,
    absChange,
    prevClose,
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
      const fresh = getCachedQuote(symbol, now);
      if (fresh) {
        results[symbol] = fresh;
        continue;
      }

      const stale = getCachedQuote(symbol, now, STALE_TTL_MS);
      if (stale) {
        results[symbol] = stale;
      }
      pendingSymbols.push(symbol);
    }

    const promises = pendingSymbols.map(async (originalSymbol) => {
      try {
        const quote = await fetchQuote(originalSymbol);
        if (!quote) return;

        marketCache.set(originalSymbol, {
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
