const CACHE_TTL_MS = 5_000;
const STALE_TTL_MS = 30_000;
const YAHOO_TIMEOUT_MS = 2_600;

const marketCache = globalThis.__INVEST_BRAIN_MARKET_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_MARKET_CACHE__ = marketCache;

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json,text/plain,*/*',
};

const mapSymbol = (sym) => {
  let clean = sym.replace(/^(gb_|hf_|us|hk|sh|sz)/i, '').toUpperCase();
  if (clean === 'IXIC') return '^IXIC';
  if (clean === 'NDX') return '^NDX';
  if (clean === 'INX') return '^GSPC';
  if (clean === 'NQ') return 'NQ=F';
  if (clean === 'ES') return 'ES=F';
  if (clean === 'YM') return 'YM=F';
  if (clean === 'CL') return 'CL=F';
  return clean;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = YAHOO_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const getCachedQuote = (symbol, now, maxAge = CACHE_TTL_MS) => {
  const cached = marketCache.get(symbol);
  if (!cached || now - cached.fetchedAt > maxAge) return null;
  return cached.data;
};

const fetchQuote = async (originalSymbol) => {
  const yfSymbol = mapSymbol(originalSymbol);
  const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?interval=1d&range=1d`;
  const response = await fetchWithTimeout(apiUrl, { headers: YAHOO_HEADERS });

  if (!response.ok) {
    throw new Error(`Yahoo chart responded with ${response.status}`);
  }

  const data = await response.json();
  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta) return null;

  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? 0;
  const absChange = price - prevClose;
  const pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : 0;

  return {
    symbol: originalSymbol,
    name: meta.shortName || meta.longName || yfSymbol,
    price,
    pctChange,
    absChange,
    prevClose,
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
