import { fetchWithTimeout, fetchYahooChart, mapYahooSymbol, toPercent, YAHOO_HEADERS } from './_lib/yahoo.js';
import { fetchLongbridgeStockSnapshot, getLongbridgeCredentials, hasLongbridgeCredentials } from './_lib/longbridge.js';

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

function rawValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'raw' in value) return value.raw ?? null;
  return value;
}

function fmtValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'fmt' in value) return value.fmt ?? null;
  return value;
}

function pickText(...values) {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || null;
}

function classifyIndustryRank({ marketCap, revenueGrowth, profitMargins, returnOnEquity, beta }) {
  let score = 0;
  if (Number(marketCap) >= 50_000_000_000) score += 24;
  else if (Number(marketCap) >= 10_000_000_000) score += 18;
  else if (Number(marketCap) >= 2_000_000_000) score += 12;

  if (Number(revenueGrowth) >= 0.12) score += 22;
  else if (Number(revenueGrowth) >= 0.03) score += 14;
  else if (Number(revenueGrowth) > -0.05) score += 8;

  if (Number(profitMargins) >= 0.18) score += 22;
  else if (Number(profitMargins) >= 0.08) score += 14;
  else if (Number(profitMargins) > 0) score += 8;

  if (Number(returnOnEquity) >= 0.2) score += 18;
  else if (Number(returnOnEquity) >= 0.1) score += 12;
  else if (Number(returnOnEquity) > 0) score += 6;

  if (Number(beta) > 0 && Number(beta) <= 1.4) score += 14;
  else if (Number(beta) > 1.4 && Number(beta) <= 2) score += 8;
  else if (Number(beta) > 2) score += 4;

  if (score >= 78) return { tier: 'A', label: '行业第一梯队', percentile: Math.min(96, score) };
  if (score >= 58) return { tier: 'B', label: '行业中上游', percentile: score };
  if (score >= 36) return { tier: 'C', label: '行业观察区', percentile: score };
  return { tier: 'D', label: '行业弱势/数据不足', percentile: Math.max(12, score) };
}

async function fetchQuoteSummary(symbol) {
  const yahooSymbol = mapYahooSymbol(symbol);
  const modules = [
    'assetProfile',
    'summaryProfile',
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'price',
    'quoteType',
  ].join(',');
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}`;
  const response = await fetchWithTimeout(url, { headers: YAHOO_HEADERS }, 4_500);
  if (!response.ok) throw new Error(`Yahoo quoteSummary responded with ${response.status}`);
  const data = await response.json();
  const result = data.quoteSummary?.result?.[0];
  if (!result) throw new Error(data.quoteSummary?.error?.description || 'No quoteSummary data');
  return result;
}

function buildCompanyProfile(symbol, summary = {}, dailyMeta = {}, intradayMeta = {}, longbridgeSnapshot = null) {
  const profile = summary.assetProfile || summary.summaryProfile || {};
  const details = summary.summaryDetail || {};
  const stats = summary.defaultKeyStatistics || {};
  const financial = summary.financialData || {};
  const price = summary.price || {};
  const lbStatic = longbridgeSnapshot?.staticInfo || {};
  const lbFundamentals = longbridgeSnapshot?.fundamentals || {};
  const yahooProfileAvailable = Boolean(
    profile.industry
      || rawValue(price.marketCap)
      || rawValue(details.marketCap)
      || rawValue(financial.totalRevenue)
  );
  const marketCap = lbFundamentals.marketCap
    ?? rawValue(price.marketCap)
    ?? rawValue(details.marketCap)
    ?? rawValue(stats.enterpriseValue);
  const revenueGrowth = rawValue(financial.revenueGrowth);
  const profitMargins = rawValue(financial.profitMargins);
  const returnOnEquity = rawValue(financial.returnOnEquity);
  const beta = rawValue(details.beta) ?? rawValue(stats.beta);
  const ranking = classifyIndustryRank({ marketCap, revenueGrowth, profitMargins, returnOnEquity, beta });

  return {
    name: pickText(lbStatic.nameCn, price.longName, lbStatic.nameEn, price.shortName, dailyMeta.longName, dailyMeta.shortName, intradayMeta.longName, intradayMeta.shortName, symbol),
    nameEn: pickText(lbStatic.nameEn, price.longName, price.shortName),
    nameHk: pickText(lbStatic.nameHk),
    exchangeName: pickText(lbStatic.exchange, price.exchangeName, dailyMeta.exchangeName, intradayMeta.exchangeName),
    currency: pickText(lbStatic.currency, price.currency, dailyMeta.currency, intradayMeta.currency, 'USD'),
    country: pickText(profile.country),
    city: pickText(profile.city),
    sector: pickText(profile.sector),
    industry: pickText(profile.industry),
    website: pickText(profile.website),
    employees: rawValue(profile.fullTimeEmployees),
    businessSummary: pickText(profile.longBusinessSummary),
    officers: (profile.companyOfficers || []).slice(0, 4).map((officer) => ({
      name: officer.name,
      title: officer.title,
      age: rawValue(officer.age),
    })).filter((officer) => officer.name || officer.title),
    marketCap,
    floatMarketCap: lbFundamentals.floatMarketCap ?? null,
    enterpriseValue: rawValue(stats.enterpriseValue),
    trailingPE: lbFundamentals.trailingPE ?? rawValue(details.trailingPE) ?? rawValue(stats.trailingPE),
    forwardPE: rawValue(stats.forwardPE),
    priceToBook: lbFundamentals.priceToBook ?? rawValue(stats.priceToBook),
    beta,
    dividendYield: rawValue(details.dividendYield),
    dividendPerShare: lbStatic.dividendPerShare ?? null,
    eps: lbStatic.eps ?? null,
    epsTtm: lbStatic.epsTtm ?? null,
    bps: lbStatic.bps ?? null,
    lotSize: lbStatic.lotSize ?? null,
    totalShares: lbStatic.totalShares ?? null,
    circulatingShares: lbStatic.circulatingShares ?? null,
    board: pickText(lbStatic.board),
    stockDerivatives: lbStatic.stockDerivatives || [],
    profitMargins,
    grossMargins: rawValue(financial.grossMargins),
    operatingMargins: rawValue(financial.operatingMargins),
    revenueGrowth,
    earningsGrowth: rawValue(financial.earningsGrowth),
    returnOnEquity,
    totalRevenue: rawValue(financial.totalRevenue),
    grossProfits: rawValue(financial.grossProfits),
    freeCashflow: rawValue(financial.freeCashflow),
    targetMeanPrice: rawValue(financial.targetMeanPrice),
    recommendationKey: pickText(financial.recommendationKey),
    recommendationMean: rawValue(financial.recommendationMean),
    industryRank: ranking,
    providers: {
      longbridge: longbridgeSnapshot ? 'ok' : 'missing',
      yahooProfile: yahooProfileAvailable ? 'ok' : 'fallback',
    },
    dataQuality: longbridgeSnapshot ? 'LONGBRIDGE_ENHANCED' : (yahooProfileAvailable ? 'PROFILE' : 'FALLBACK'),
  };
}

function buildSnapshot(symbol, dailyResult, intradayResult, quoteSummary = null, profileError = null, longbridgeSnapshot = null, longbridgeError = null) {
  const dailyMeta = dailyResult.meta || {};
  const intradayMeta = intradayResult.meta || {};
  const { closes, volumes, rows } = normalizeChart(dailyResult);

  if (!closes.length) {
    throw new Error('No usable close data found');
  }

  const longbridgeQuote = longbridgeSnapshot?.quote || {};
  const latestPrice = longbridgeQuote.price ?? intradayMeta.regularMarketPrice ?? dailyMeta.regularMarketPrice ?? last(closes) ?? null;
  const previousClose = longbridgeQuote.previousClose ?? intradayMeta.chartPreviousClose ?? null;
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
  const latestVolume = longbridgeQuote.dayVolume ?? intradayMeta.regularMarketVolume ?? last(volumes) ?? null;
  const volumeRatio20 = latestVolume && avgVolume20 ? latestVolume / avgVolume20 : null;
  const sma50 = simpleMovingAverage(closes, 50);
  const sma200 = simpleMovingAverage(closes, 200);
  const return1m = periodReturn(closes, 21);
  const return3m = periodReturn(closes, 63);
  const return6m = periodReturn(closes, 126);
  const return1y = closes.length > 1 && latestPrice !== null ? latestPrice / closes[0] - 1 : null;
  const trend = getTrendLabel({ price: latestPrice, sma50, sma200, return3m });
  const risk = getRiskLevel({ annualizedVolatility, drawdown });
  const company = buildCompanyProfile(symbol, quoteSummary || {}, dailyMeta, intradayMeta, longbridgeSnapshot);

  return {
    success: true,
    symbol: String(symbol || '').toUpperCase(),
    generatedAt: new Date().toISOString(),
    source: {
      provider: longbridgeSnapshot ? 'Longbridge + Yahoo Finance chart' : 'Yahoo Finance chart',
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
      dayHigh: longbridgeQuote.dayHigh ?? intradayMeta.regularMarketDayHigh ?? null,
      dayLow: longbridgeQuote.dayLow ?? intradayMeta.regularMarketDayLow ?? null,
      dayOpen: longbridgeQuote.dayOpen ?? intradayMeta.regularMarketOpen ?? null,
      dayVolume: latestVolume,
      turnover: longbridgeQuote.turnover ?? null,
      timestamp: longbridgeQuote.timestamp ?? null,
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
    company,
    dataStatus: {
      companyProfile: quoteSummary ? 'ok' : 'fallback',
      longbridge: longbridgeSnapshot ? 'ok' : (longbridgeError ? 'error' : 'missing_credentials'),
      profileError: quoteSummary ? null : (profileError?.message || '公司画像接口暂不可用，已显示行情与技术快照。'),
      longbridgeError: longbridgeError?.message || null,
    },
  };
}

function buildLongbridgeFallbackSnapshot(symbol, longbridgeSnapshot, errors = {}) {
  const quote = longbridgeSnapshot?.quote || {};
  const company = buildCompanyProfile(symbol, {}, {}, {}, longbridgeSnapshot);
  return {
    success: true,
    symbol: String(symbol || '').toUpperCase(),
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'Longbridge fallback',
      range: 'realtime',
      interval: 'quote',
    },
    meta: {
      name: company.name || symbol,
      currency: company.currency || 'USD',
      exchangeName: company.exchangeName || null,
      instrumentType: 'EQUITY',
      latestDate: quote.timestamp || null,
      observations: 0,
    },
    quote: {
      price: quote.price ?? null,
      previousClose: quote.previousClose ?? null,
      dayChange: quote.dayChange ?? null,
      dayChangePct: toPercent(quote.dayChangePct ?? null),
      dayHigh: quote.dayHigh ?? null,
      dayLow: quote.dayLow ?? null,
      dayOpen: quote.dayOpen ?? null,
      dayVolume: quote.dayVolume ?? null,
      turnover: quote.turnover ?? null,
      timestamp: quote.timestamp ?? null,
    },
    metrics: {
      return1m: null,
      return3m: null,
      return6m: null,
      return1y: null,
      annualizedVolatility: null,
      maxDrawdown: null,
      sma50: null,
      sma200: null,
      high52: null,
      low52: null,
      week52Position: null,
      avgVolume20: null,
      volumeRatio20: null,
      trend: 'INSUFFICIENT_DATA',
      risk: 'LOW',
    },
    company,
    dataStatus: {
      companyProfile: 'fallback',
      longbridge: 'ok',
      profileError: errors.profileError?.message || 'Yahoo 公司画像暂不可用，已使用长桥基础资料。',
      chartError: errors.chartError?.message || null,
      longbridgeError: null,
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

    const longbridgeCredentials = getLongbridgeCredentials(req.headers || {});
    const cacheKey = [
      String(symbol).trim().toUpperCase(),
      hasLongbridgeCredentials(longbridgeCredentials) ? 'longbridge' : 'public',
    ].join(':');
    const cached = snapshotCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.setHeader('X-IB-Stock-Snapshot-Cache', 'hit');
      return res.status(200).json(cached.payload);
    }

    const [daily, intraday, quoteSummaryResult, longbridgeResult] = await Promise.allSettled([
      fetchYahooChart(symbol, { interval: '1d', range: '1y', timeoutMs: SNAPSHOT_TIMEOUT_MS }),
      fetchYahooChart(symbol, { interval: '1d', range: '1d', timeoutMs: SNAPSHOT_TIMEOUT_MS }),
      fetchQuoteSummary(symbol),
      hasLongbridgeCredentials(longbridgeCredentials)
        ? fetchLongbridgeStockSnapshot(symbol, longbridgeCredentials)
        : Promise.resolve(null),
    ]);
    const longbridgeSnapshot = longbridgeResult.status === 'fulfilled' ? longbridgeResult.value : null;
    let payload;
    if (daily.status === 'fulfilled' && intraday.status === 'fulfilled') {
      payload = buildSnapshot(
        symbol,
        daily.value.result,
        intraday.value.result,
        quoteSummaryResult.status === 'fulfilled' ? quoteSummaryResult.value : null,
        quoteSummaryResult.status === 'rejected' ? quoteSummaryResult.reason : null,
        longbridgeSnapshot,
        longbridgeResult.status === 'rejected' ? longbridgeResult.reason : null
      );
    } else if (longbridgeSnapshot) {
      payload = buildLongbridgeFallbackSnapshot(symbol, longbridgeSnapshot, {
        chartError: daily.status === 'rejected' ? daily.reason : intraday.reason,
        profileError: quoteSummaryResult.status === 'rejected' ? quoteSummaryResult.reason : null,
      });
    } else {
      throw daily.status === 'rejected' ? daily.reason : intraday.reason;
    }

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
