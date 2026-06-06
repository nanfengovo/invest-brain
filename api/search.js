const SEARCH_CACHE_TTL_MS = 45_000;
const YAHOO_TIMEOUT_MS = 3_000;

const searchCache = globalThis.__INVEST_BRAIN_SEARCH_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_SEARCH_CACHE__ = searchCache;

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const q = searchParams.get('q');

    if (!q) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    const cacheKey = q.trim().toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= SEARCH_CACHE_TTL_MS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.setHeader('X-IB-Search-Cache', 'hit');
      return res.status(200).json({ success: true, data: cached.data });
    }

    const apiUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    
    // Add a basic User-Agent to avoid blocks
    const response = await fetchWithTimeout(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'application/json,text/plain,*/*',
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Search API responded with status: ${response.status}`);
    }

    const data = await response.json();
    const quotes = data.quotes || [];

    searchCache.set(cacheKey, {
      fetchedAt: Date.now(),
      data: quotes,
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('X-IB-Search-Cache', 'miss');

    return res.status(200).json({ success: true, data: quotes });

  } catch (error) {
    console.error('Search Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
