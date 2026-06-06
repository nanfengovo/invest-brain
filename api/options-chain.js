import { fetchWithTimeout, YAHOO_HEADERS } from './_lib/yahoo.js';

export const config = {
  maxDuration: 20,
};

const CACHE_TTL_MS = 3 * 60 * 1000;
const optionsCache = globalThis.__INVEST_BRAIN_OPTIONS_CHAIN_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_OPTIONS_CHAIN_CACHE__ = optionsCache;

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toDateStringFromUnix(seconds) {
  if (!seconds) return null;
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

function toUnixExpiration(date) {
  if (!date) return null;
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

function markPrice(bid, ask, last) {
  const b = toNumber(bid);
  const a = toNumber(ask);
  if (b !== null && a !== null && a >= b) return Number(((a + b) / 2).toFixed(4));
  return toNumber(last);
}

function normalizeTradierOption(option, fallbackExpiration) {
  const bid = toNumber(option.bid);
  const ask = toNumber(option.ask);
  const greeks = option.greeks || {};
  return {
    contractSymbol: option.symbol,
    underlying: option.underlying,
    type: String(option.option_type || '').toUpperCase(),
    expiration: option.expiration_date || fallbackExpiration,
    strike: toNumber(option.strike),
    last: toNumber(option.last),
    bid,
    ask,
    mark: markPrice(bid, ask, option.last),
    change: toNumber(option.change),
    percentChange: toNumber(option.change_percentage),
    volume: toNumber(option.volume),
    openInterest: toNumber(option.open_interest),
    impliedVolatility: toNumber(greeks.mid_iv ?? greeks.smvi),
    delta: toNumber(greeks.delta),
    gamma: toNumber(greeks.gamma),
    theta: toNumber(greeks.theta),
    vega: toNumber(greeks.vega),
    rho: toNumber(greeks.rho),
    inTheMoney: null,
    provider: 'Tradier',
  };
}

function normalizeYahooOption(option, type, expiration) {
  const bid = toNumber(option.bid);
  const ask = toNumber(option.ask);
  return {
    contractSymbol: option.contractSymbol,
    underlying: null,
    type,
    expiration,
    strike: toNumber(option.strike),
    last: toNumber(option.lastPrice),
    bid,
    ask,
    mark: markPrice(bid, ask, option.lastPrice),
    change: toNumber(option.change),
    percentChange: toNumber(option.percentChange),
    volume: toNumber(option.volume),
    openInterest: toNumber(option.openInterest),
    impliedVolatility: toNumber(option.impliedVolatility),
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    rho: null,
    inTheMoney: Boolean(option.inTheMoney),
    provider: 'Yahoo Finance',
  };
}

function normalizePolygonOption(item) {
  const details = item.details || {};
  const quote = item.last_quote || {};
  const day = item.day || {};
  const greeks = item.greeks || {};
  const bid = toNumber(quote.bid);
  const ask = toNumber(quote.ask);
  return {
    contractSymbol: details.ticker,
    underlying: details.underlying_ticker,
    type: String(details.contract_type || '').toUpperCase() === 'PUT' ? 'PUT' : 'CALL',
    expiration: details.expiration_date,
    strike: toNumber(details.strike_price),
    last: toNumber(day.close),
    bid,
    ask,
    mark: markPrice(bid, ask, day.close),
    change: toNumber(day.change),
    percentChange: toNumber(day.change_percent),
    volume: toNumber(day.volume),
    openInterest: toNumber(item.open_interest),
    impliedVolatility: toNumber(item.implied_volatility),
    delta: toNumber(greeks.delta),
    gamma: toNumber(greeks.gamma),
    theta: toNumber(greeks.theta),
    vega: toNumber(greeks.vega),
    rho: null,
    inTheMoney: null,
    provider: 'Polygon',
  };
}

async function fetchTradier(symbol, expiration, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  const expirationsUrl = `https://api.tradier.com/v1/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true&strikes=false`;
  const expirationsResponse = await fetchWithTimeout(expirationsUrl, { headers }, 5_000);
  if (!expirationsResponse.ok) {
    throw new Error(`Tradier expirations responded with ${expirationsResponse.status}`);
  }
  const expirationsJson = await expirationsResponse.json();
  const expirations = []
    .concat(expirationsJson.expirations?.date || [])
    .filter(Boolean);
  const selectedExpiration = expiration || expirations[0];

  if (!selectedExpiration) {
    return { expirations, selectedExpiration: null, options: [] };
  }

  const chainUrl = `https://api.tradier.com/v1/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${encodeURIComponent(selectedExpiration)}&greeks=true`;
  const chainResponse = await fetchWithTimeout(chainUrl, { headers }, 7_000);
  if (!chainResponse.ok) {
    throw new Error(`Tradier chain responded with ${chainResponse.status}`);
  }
  const chainJson = await chainResponse.json();
  const rawOptions = []
    .concat(chainJson.options?.option || [])
    .filter(Boolean);

  return {
    expirations,
    selectedExpiration,
    options: rawOptions.map((item) => normalizeTradierOption(item, selectedExpiration)),
  };
}

async function fetchYahooOptions(symbol, expiration) {
  const baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const firstResponse = await fetchWithTimeout(baseUrl, { headers: YAHOO_HEADERS }, 5_000);
  if (!firstResponse.ok) {
    throw new Error(`Yahoo options responded with ${firstResponse.status}`);
  }
  const firstJson = await firstResponse.json();
  const firstResult = firstJson.optionChain?.result?.[0];
  if (!firstResult) {
    throw new Error(firstJson.optionChain?.error?.description || 'No option chain found');
  }

  const expirations = (firstResult.expirationDates || [])
    .map(toDateStringFromUnix)
    .filter(Boolean);
  const selectedExpiration = expiration || expirations[0];
  const selectedUnix = toUnixExpiration(selectedExpiration);
  let result = firstResult;

  if (selectedUnix && selectedExpiration !== expirations[0]) {
    const chainUrl = `${baseUrl}?date=${selectedUnix}`;
    const chainResponse = await fetchWithTimeout(chainUrl, { headers: YAHOO_HEADERS }, 5_000);
    if (!chainResponse.ok) {
      throw new Error(`Yahoo selected chain responded with ${chainResponse.status}`);
    }
    const chainJson = await chainResponse.json();
    result = chainJson.optionChain?.result?.[0] || firstResult;
  }

  const chain = result.options?.[0] || {};
  const calls = (chain.calls || []).map((item) => normalizeYahooOption(item, 'CALL', selectedExpiration));
  const puts = (chain.puts || []).map((item) => normalizeYahooOption(item, 'PUT', selectedExpiration));

  return {
    expirations,
    selectedExpiration,
    options: [...calls, ...puts],
  };
}

async function fetchPolygon(symbol, expiration, token) {
  const contractsUrl = new URL('https://api.polygon.io/v3/reference/options/contracts');
  contractsUrl.searchParams.set('underlying_ticker', symbol);
  contractsUrl.searchParams.set('expired', 'false');
  contractsUrl.searchParams.set('limit', '1000');
  contractsUrl.searchParams.set('apiKey', token);
  const contractsResponse = await fetchWithTimeout(contractsUrl.toString(), {}, 7_000);
  if (!contractsResponse.ok) {
    throw new Error(`Polygon contracts responded with ${contractsResponse.status}`);
  }
  const contractsJson = await contractsResponse.json();
  const expirations = Array.from(
    new Set((contractsJson.results || []).map((item) => item.expiration_date).filter(Boolean))
  ).sort();
  const selectedExpiration = expiration || expirations[0];

  if (!selectedExpiration) {
    return { expirations, selectedExpiration: null, options: [] };
  }

  const snapshotUrl = new URL(`https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(symbol)}`);
  snapshotUrl.searchParams.set('expiration_date', selectedExpiration);
  snapshotUrl.searchParams.set('limit', '250');
  snapshotUrl.searchParams.set('sort', 'strike_price');
  snapshotUrl.searchParams.set('apiKey', token);
  const snapshotResponse = await fetchWithTimeout(snapshotUrl.toString(), {}, 7_000);
  if (!snapshotResponse.ok) {
    throw new Error(`Polygon option snapshot responded with ${snapshotResponse.status}`);
  }
  const snapshotJson = await snapshotResponse.json();
  return {
    expirations,
    selectedExpiration,
    options: (snapshotJson.results || []).map(normalizePolygonOption),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbol = String(searchParams.get('symbol') || '').trim().toUpperCase();
    const expiration = searchParams.get('expiration') || null;
    const provider = searchParams.get('provider') || 'auto';
    const tradierToken = req.headers['x-tradier-token'] || process.env.TRADIER_TOKEN || '';
    const polygonToken = req.headers['x-polygon-token'] || process.env.POLYGON_API_KEY || '';

    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const cacheKey = `${provider}:${symbol}:${expiration || 'front'}:${tradierToken ? 'tradier' : ''}:${polygonToken ? 'polygon' : ''}`;
    const cached = optionsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      res.setHeader('X-IB-Options-Cache', 'hit');
      return res.status(200).json(cached.payload);
    }

    let payload;
    if (provider === 'tradier' || (provider === 'auto' && tradierToken)) {
      payload = {
        success: true,
        symbol,
        provider: 'Tradier',
        generatedAt: new Date().toISOString(),
        ...(await fetchTradier(symbol, expiration, tradierToken)),
      };
    } else if (provider === 'polygon' || (provider === 'auto' && polygonToken)) {
      payload = {
        success: true,
        symbol,
        provider: 'Polygon',
        generatedAt: new Date().toISOString(),
        ...(await fetchPolygon(symbol, expiration, polygonToken)),
      };
    } else if (provider === 'yahoo') {
      payload = {
        success: true,
        symbol,
        provider: 'Yahoo Finance',
        generatedAt: new Date().toISOString(),
        ...(await fetchYahooOptions(symbol, expiration)),
      };
    } else {
      payload = {
        success: true,
        symbol,
        provider: '未配置',
        generatedAt: new Date().toISOString(),
        expirations: [],
        selectedExpiration: null,
        options: [],
        message: '期权链需要在设置中配置 Tradier 或 Polygon API Token。',
      };
    }

    optionsCache.set(cacheKey, { fetchedAt: Date.now(), payload });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.setHeader('X-IB-Options-Cache', 'miss');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Options Chain Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
