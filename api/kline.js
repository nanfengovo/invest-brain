const KLINE_TIMEOUT_MS = 4_500;
const klineCache = globalThis.__INVEST_BRAIN_KLINE_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_KLINE_CACHE__ = klineCache;

const getCacheTtl = (interval) => {
  if (interval.includes('m')) return 10_000;
  if (interval.includes('h')) return 60_000;
  return 180_000;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = KLINE_TIMEOUT_MS) => {
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

    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const cacheKey = `${symbol.toUpperCase()}|${interval}|${range}`;
    const cached = klineCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= getCacheTtl(interval)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.setHeader('X-IB-Kline-Cache', 'hit');
      return res.status(200).json(cached.payload);
    }

    // Clean symbol (Sina prefix removal if present)
    let cleanSymbol = symbol.replace(/^(gb_|hf_|us|hk|sh|sz)/i, '').toUpperCase();
    
    // Map indices
    if (cleanSymbol === 'IXIC') cleanSymbol = '^IXIC';
    if (cleanSymbol === 'INX') cleanSymbol = '^GSPC';
    if (cleanSymbol === 'DJI') cleanSymbol = '^DJI';
    if (cleanSymbol === 'NQ') cleanSymbol = 'NQ=F';
    if (cleanSymbol === 'ES') cleanSymbol = 'ES=F';
    if (cleanSymbol === 'YM') cleanSymbol = 'YM=F';
    if (cleanSymbol === 'CL') cleanSymbol = 'CL=F';

    const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${cleanSymbol}?interval=${interval}&range=${range}`;
    
    const response = await fetchWithTimeout(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!response.ok) {
      throw new Error(`Yahoo API responded with status: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      throw new Error('No chart data found');
    }

    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0];
    
    // ECharts expects: [open, close, lowest, highest, volume]
    const klineData = timestamps.map((ts, i) => {
      // Return formatting for Echarts
      // date string, open, close, lowest, highest, volume
      const date = new Date(ts * 1000);
      const dateStr = interval.includes('m') || interval.includes('h') 
        ? `${date.getMonth()+1}-${date.getDate()} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`
        : `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        
      return [
        dateStr,
        quotes.open[i] || 0,
        quotes.close[i] || 0,
        quotes.low[i] || 0,
        quotes.high[i] || 0,
        quotes.volume[i] || 0
      ];
    }).filter(item => item[1] !== 0); // Remove empty data points

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('X-IB-Kline-Cache', 'miss');

    const payload = {
      success: true, 
      meta: result.meta,
      data: klineData
    };

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
