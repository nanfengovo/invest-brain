import crypto from 'node:crypto';
import { toLongbridgeMarketSymbol } from './marketSymbols.js';

const LONGBRIDGE_HTTP_URL = process.env.LONGBRIDGE_HTTP_URL || 'https://openapi.longbridge.com';
const LONGBRIDGE_HTTP_TIMEOUT_MS = 6_000;

function pickCredential(headers = {}, key, fallback = '') {
  const normalizedKey = key.toLowerCase();
  return headers[`x-${normalizedKey.replace(/_/g, '-')}`]
    || headers[`x-${normalizedKey}`]
    || fallback
    || '';
}

export function getLongbridgeCredentials(headers = {}) {
  const appKey = pickCredential(headers, 'longbridge_app_key', process.env.LONGBRIDGE_APP_KEY);
  const appSecret = pickCredential(headers, 'longbridge_app_secret', process.env.LONGBRIDGE_APP_SECRET);
  const accessToken = pickCredential(headers, 'longbridge_access_token', process.env.LONGBRIDGE_ACCESS_TOKEN);

  return {
    appKey: String(appKey || '').trim(),
    appSecret: String(appSecret || '').trim(),
    accessToken: String(accessToken || '').trim(),
  };
}

export function hasLongbridgeCredentials(credentials = {}) {
  return Boolean(credentials.appKey && credentials.appSecret && credentials.accessToken);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    if (typeof value.toString === 'function') return toNumber(value.toString());
    if ('value' in value) return toNumber(value.value);
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickText(...values) {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || null;
}

function cleanHtmlText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function pickNonNumericText(...values) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter((value) => value && !/^-?\d+(?:\.\d+)?$/.test(value))
    .find(Boolean) || null;
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || [];
}

function toPlainJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toJSON === 'function') return value.toJSON();
  if (Array.isArray(value)) return value.map(toPlainJson);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toString === 'function' && value.constructor?.name === 'Decimal') {
    return value.toString();
  }
  return value;
}

function parseJsonMaybe(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeSdkError(error, scope = '长桥数据') {
  const message = String(error?.message || error || '请求失败');
  if (/permission|not.?authorized|unauthor|forbidden|no access|auth/i.test(message)) {
    return `${scope}权限不足或当前账号未开通对应行情/基本面权限。`;
  }
  if (/timeout|aborted|deadline/i.test(message)) {
    return `${scope}请求超时，请稍后重试。`;
  }
  if (/OPRA|option/i.test(message) && /quote|permission|access|auth/i.test(message)) {
    return `${scope}需要开通 OPRA US Options Quotes（OpenAPI）权限。`;
  }
  return message.replace(/^Error:\s*/i, '');
}

function percentToRatio(value) {
  const number = toNumber(value);
  return number === null ? null : number / 100;
}

function pickNumber(...values) {
  for (const value of values) {
    const number = toNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function normalizePercent(value) {
  const number = toNumber(value);
  if (number === null) return null;
  return Math.abs(number) > 1 ? number / 100 : number;
}

function hasPayload(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    return Object.values(value).some((item) => {
      if (Array.isArray(item)) return item.length > 0;
      if (item && typeof item === 'object') return Object.keys(item).length > 0;
      return item !== null && item !== undefined && item !== '';
    });
  }
  return true;
}

function unwrapMetricValue(metric) {
  if (metric === null || metric === undefined) return null;
  if (typeof metric === 'object') {
    return toNumber(metric.value ?? metric.raw ?? metric.current);
  }
  return toNumber(metric);
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function hmacSha256(value, key) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function stableQueryString(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
      return;
    }
    searchParams.set(key, String(value));
  });
  return searchParams.toString();
}

function buildSignature({ method, path, query, body = '', credentials, timestamp }) {
  const signedHeaders = 'authorization;x-api-key;x-timestamp';
  const signedValues = [
    `authorization:${credentials.accessToken}`,
    `x-api-key:${credentials.appKey}`,
    `x-timestamp:${timestamp}`,
    '',
  ].join('\n');
  let stringToSign = `${method.toUpperCase()}|${path}|${query || ''}|${signedValues}|${signedHeaders}|`;
  if (body) stringToSign += sha1(body);
  const hashed = sha1(stringToSign);
  const signature = hmacSha256(`HMAC-SHA256|${hashed}`, credentials.appSecret);
  return `HMAC-SHA256 SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function requestLongbridge(path, credentials, { method = 'GET', query = null, body = null } = {}) {
  const queryString = stableQueryString(query);
  const url = new URL(`${path}${queryString ? `?${queryString}` : ''}`, LONGBRIDGE_HTTP_URL);
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyText = body ? JSON.stringify(body) : '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LONGBRIDGE_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'User-Agent': 'invest-brain-local-first',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Api-Key': credentials.appKey,
        Authorization: credentials.accessToken,
        'X-Timestamp': String(timestamp),
        'X-Api-Signature': buildSignature({
          method,
          path,
          query: queryString,
          body: bodyText,
          credentials,
          timestamp,
        }),
      },
      ...(bodyText ? { body: bodyText } : {}),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`长桥 HTTP ${response.status}: ${json.message || text || '请求失败'}`);
    }
    if (Number(json.code) !== 0) {
      throw new Error(json.message || `长桥 OpenAPI 错误：${json.code}`);
    }
    return json.data || null;
  } finally {
    clearTimeout(timeout);
  }
}

function toLongbridgeCounterId(symbol) {
  const lbSymbol = toLongbridgeStockSymbol(symbol);
  const [codeRaw, marketRaw] = lbSymbol.split('.');
  const market = String(marketRaw || 'US').toUpperCase();
  const code = market === 'HK' && /^\d+$/.test(codeRaw)
    ? String(Number(codeRaw))
    : codeRaw;
  if (!code) return '';
  if (code.startsWith('.')) return `IX/${market}/${code}`;
  return `ST/${market}/${code}`;
}

function parseLongbridgeCounterId(counterId) {
  const match = String(counterId || '').match(/^(ST|IX)\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  const [, type, marketRaw, codeRaw] = match;
  const market = String(marketRaw || '').toUpperCase();
  const code = String(codeRaw || '').toUpperCase();
  if (!market || !code) return null;
  return {
    type: type.toUpperCase(),
    market,
    code,
    symbol: `${code}.${market}`,
    displaySymbol: code,
  };
}

function getDefaultCurrencyForLongbridgeSymbol(symbol) {
  const market = String(symbol || '').split('.').pop()?.toUpperCase();
  if (market === 'HK') return 'HKD';
  if (market === 'SH' || market === 'SZ' || market === 'CN') return 'CNY';
  if (market === 'SG') return 'SGD';
  return 'USD';
}

export function toLongbridgeStockSymbol(symbol) {
  const text = toLongbridgeMarketSymbol(symbol);
  if (!text) return '';
  if (/\.(US|HK|CN|SH|SZ|SG)$/i.test(text)) return text;
  return `${text}.US`;
}

export function toLongbridgeOptionSymbol(contractSymbol) {
  const text = String(contractSymbol || '').replace(/^OPTION_/i, '').trim().toUpperCase();
  const match = text.match(/^([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return '';
  const [, underlying, yymmdd, side, strikeRaw] = match;
  return `${underlying}${yymmdd}${side}${String(Number(strikeRaw)).padStart(6, '0')}.US`;
}

function latestValuationValue(metric) {
  const list = Array.isArray(metric?.list) ? metric.list : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const value = toNumber(list[index]?.value);
    if (value !== null) return value;
  }
  return toNumber(metric?.value);
}

function parseIndustryRankFromText(...values) {
  const text = values
    .map((value) => String(value || ''))
    .join(' ')
    .replace(/<[^>]*>/g, ' ');
  const match = text.match(/(?:行业排名|rank)\s*(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const position = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(position) || !Number.isFinite(total) || position <= 0 || total <= 0) return null;
  const percentile = Math.max(1, Math.min(100, Math.round((1 - ((position - 1) / total)) * 100)));
  let tier = 'D';
  if (percentile >= 78) tier = 'A';
  else if (percentile >= 58) tier = 'B';
  else if (percentile >= 36) tier = 'C';
  return {
    tier,
    label: `行业排名 ${position}/${total}`,
    percentile,
    position,
    total,
    source: 'longbridge',
  };
}

function pickValuationSummary(detail = {}, valuation = null) {
  const overviewMetrics = detail?.overview?.metrics || {};
  const overviewDescriptions = Object.values(overviewMetrics)
    .map((metric) => metric?.desc)
    .filter(Boolean);
  const historyMetrics = detail?.history?.metrics || {};
  const historyDescriptions = Object.values(historyMetrics)
    .map((metric) => metric?.desc)
    .filter(Boolean);
  const valuationMetrics = valuation?.metrics || {};
  const valuationDescriptions = Object.values(valuationMetrics)
    .map((metric) => metric?.desc)
    .filter(Boolean);
  return cleanHtmlText(pickText(
    detail?.overview?.ai_summary,
    detail?.ai_summary,
    ...overviewDescriptions,
    ...historyDescriptions,
    ...valuationDescriptions,
    detail?.desc,
    detail?.description
  ));
}

function findSymbolRecord(payload, symbol) {
  const cleanSymbol = String(symbol || '').replace(/\.(US|HK|SH|SZ|CN|SG)$/i, '').toUpperCase();
  const candidates = firstArray(
    payload?.list,
    payload?.items,
    payload?.data,
    payload?.comparisons,
    payload?.securities,
    Array.isArray(payload) ? payload : []
  );
  return candidates.find((item) => {
    const itemSymbol = String(item?.symbol || item?.ticker || item?.code || '').replace(/\.(US|HK|SH|SZ|CN|SG)$/i, '').toUpperCase();
    return itemSymbol === cleanSymbol;
  }) || candidates[0] || null;
}

function normalizeIndustryValuation(payload, symbol) {
  const record = findSymbolRecord(payload, symbol) || payload || {};
  return {
    marketCap: toNumber(record.marketValue ?? record.market_value ?? record.market_cap),
    floatMarketCap: toNumber(record.floatMarketValue ?? record.float_market_value ?? record.float_market_cap),
    trailingPE: toNumber(record.pe ?? record.pettm ?? record.ttm_pe),
    priceToBook: toNumber(record.pb),
    priceToSales: toNumber(record.ps),
    eps: toNumber(record.eps),
    bps: toNumber(record.bps),
    dividendYield: percentToRatio(record.divYld ?? record.div_yld ?? record.dividend_yield),
    returnOnEquity: percentToRatio(record.roe),
    profitMargins: percentToRatio(record.net_margin ?? record.profit_margin),
    totalRevenue: toNumber(record.sales ?? record.revenue ?? record.total_revenue),
    netIncome: toNumber(record.net_income ?? record.profit),
  };
}

function normalizeFinancialSnapshot(payload) {
  const revenue = payload?.fr_revenue || payload?.fo_revenue || {};
  const profit = payload?.fr_profit || {};
  return {
    reportSummary: pickText(payload?.report_desc, payload?.summary),
    financialPeriod: [payload?.fp_start, payload?.fp_end].filter(Boolean).join(' - ') || null,
    revenue: unwrapMetricValue(revenue),
    revenueGrowth: percentToRatio(revenue?.yoy),
    netIncome: unwrapMetricValue(profit),
    netIncomeGrowth: percentToRatio(profit?.yoy),
    operatingCashflow: unwrapMetricValue(payload?.fr_operate_cash),
    totalAssets: unwrapMetricValue(payload?.fr_total_assets),
    totalLiabilities: unwrapMetricValue(payload?.fr_total_liability),
    returnOnEquity: percentToRatio(payload?.fr_roe_ttm),
    profitMargins: percentToRatio(payload?.fr_profit_margin_ttm ?? payload?.fr_profit_margin),
    debtToAssets: percentToRatio(payload?.fr_debt_assets_ratio),
    eps: unwrapMetricValue(payload?.fo_eps),
  };
}

function normalizeLongbridgeQuote(quote) {
  if (!quote) return null;
  return {
    symbol: pickText(quote.symbol),
    name: pickText(quote.nameCn, quote.name_cn, quote.nameZhCN, quote.nameEn, quote.name_en, quote.name),
    price: toNumber(quote.lastDone ?? quote.last_done),
    previousClose: toNumber(quote.prevClose ?? quote.prev_close),
    dayOpen: toNumber(quote.open),
    dayHigh: toNumber(quote.high),
    dayLow: toNumber(quote.low),
    dayVolume: toNumber(quote.volume),
    turnover: toNumber(quote.turnover),
    currency: pickText(quote.currency),
    timestamp: quote.timestamp ? new Date(quote.timestamp).toISOString() : null,
    tradeStatus: quote.tradeStatus ?? quote.trade_status ?? null,
    provider: 'Longbridge HTTP',
  };
}

function isLongbridgeIntradayInterval(interval) {
  return /^\d+(m|h)$/i.test(String(interval || '').trim());
}

function formatLongbridgeCandleDate(timestamp, interval) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return isLongbridgeIntradayInterval(interval)
    ? `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    : `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function getLongbridgePeriod(sdk, interval) {
  const text = String(interval || '').toLowerCase();
  if (text === '1m') return sdk.Period?.Min_1 ?? 1;
  if (text === '2m') return sdk.Period?.Min_2 ?? 2;
  if (text === '3m') return sdk.Period?.Min_3 ?? 3;
  if (text === '5m') return sdk.Period?.Min_5 ?? 4;
  if (text === '10m') return sdk.Period?.Min_10 ?? 5;
  if (text === '15m') return sdk.Period?.Min_15 ?? 6;
  if (text === '30m') return sdk.Period?.Min_30 ?? 8;
  if (text === '60m' || text === '1h') return sdk.Period?.Min_60 ?? 10;
  if (text === '1wk' || text === '1w') return sdk.Period?.Week ?? 15;
  if (text === '1mo') return sdk.Period?.Month ?? 16;
  if (text === '3mo' || text === '1q') return sdk.Period?.Quarter ?? 17;
  if (text === '1y') return sdk.Period?.Year ?? 18;
  return sdk.Period?.Day ?? 14;
}

function getLongbridgeKlineCount({ interval, range }) {
  const intervalText = String(interval || '').toLowerCase();
  const rangeText = String(range || '').toLowerCase();
  if (isLongbridgeIntradayInterval(intervalText)) {
    if (rangeText === '1d') return 420;
    if (rangeText === '5d') return 500;
    return 800;
  }
  if (intervalText === '1wk' || intervalText === '1w') {
    if (rangeText === '6mo') return 30;
    if (rangeText === '1y') return 60;
    if (rangeText === '2y') return 110;
    if (rangeText === '5y') return 270;
    return 160;
  }
  if (intervalText === '1mo') {
    if (rangeText === '1y') return 14;
    if (rangeText === '2y') return 26;
    if (rangeText === '5y') return 62;
    if (rangeText === '10y') return 122;
    return 62;
  }
  if (intervalText === '3mo' || intervalText === '1y') {
    if (rangeText === '5y') return 22;
    if (rangeText === '10y') return 42;
    return 42;
  }
  if (rangeText === '1d' || rangeText === '5d') return 10;
  if (rangeText === '1mo') return 25;
  if (rangeText === '3mo') return 66;
  if (rangeText === '6mo') return 132;
  if (rangeText === '1y') return 260;
  if (rangeText === '2y') return 520;
  if (rangeText === '5y') return 1000;
  return 260;
}

function normalizeLongbridgeCandle(candle, interval) {
  if (!candle) return null;
  const plain = toPlainJson(candle) || {};
  const timestamp = plain.timestamp ?? candle.timestamp;
  const open = toNumber(plain.open ?? candle.open);
  const close = toNumber(plain.close ?? candle.close);
  const low = toNumber(plain.low ?? candle.low);
  const high = toNumber(plain.high ?? candle.high);
  const volume = toNumber(plain.volume ?? candle.volume) ?? 0;
  const date = formatLongbridgeCandleDate(timestamp, interval);

  if (!date || [open, close, low, high].some((value) => value === null || value <= 0)) return null;
  return [date, open, close, low, high, volume];
}

export async function fetchLongbridgeCandlesticks(symbol, credentials, { interval = '1d', range = '6mo' } = {}) {
  // The official npm SDK ships 100MB+ native binaries, which pushes Vercel
  // Serverless Functions over the 250MB unzipped limit. Keep this endpoint
  // lightweight and let Yahoo/Stooq handle K-line fallback until Longbridge
  // exposes a small HTTP candlestick endpoint for this runtime.
  return null;
}

export async function fetchLongbridgeMarketQuote(symbol, credentials) {
  return null;
}

function normalizeLongbridgeStatic(staticInfo) {
  if (!staticInfo) return {};
  return {
    symbol: pickText(staticInfo.symbol),
    nameCn: pickText(staticInfo.nameCn, staticInfo.name_cn),
    nameEn: pickText(staticInfo.nameEn, staticInfo.name_en),
    nameHk: pickText(staticInfo.nameHk, staticInfo.name_hk),
    exchange: pickText(staticInfo.exchange),
    currency: pickText(staticInfo.currency),
    lotSize: toNumber(staticInfo.lotSize ?? staticInfo.lot_size),
    totalShares: toNumber(staticInfo.totalShares ?? staticInfo.total_shares),
    circulatingShares: toNumber(staticInfo.circulatingShares ?? staticInfo.circulating_shares),
    eps: toNumber(staticInfo.eps),
    epsTtm: toNumber(staticInfo.epsTtm ?? staticInfo.eps_ttm),
    bps: toNumber(staticInfo.bps),
    dividendPerShare: toNumber(staticInfo.dividendYield ?? staticInfo.dividend_yield),
    stockDerivatives: firstArray(staticInfo.stockDerivatives, staticInfo.stock_derivatives),
    board: pickText(staticInfo.board),
  };
}

function normalizeRatingRank(rating, institutionRating) {
  const latest = institutionRating?.latest || {};
  const stockRank = toNumber(rating?.industryRank);
  const latestRank = toNumber(latest.industryRank);
  const total = toNumber(latest.industryTotal);
  const position = stockRank || latestRank;
  if (!position) return null;
  const rankTotal = total || null;
  const percentile = rankTotal
    ? Math.max(1, Math.min(100, Math.round((1 - ((position - 1) / rankTotal)) * 100)))
    : null;
  let tier = 'D';
  if ((percentile ?? 0) >= 78) tier = 'A';
  else if ((percentile ?? 0) >= 58) tier = 'B';
  else if ((percentile ?? 0) >= 36) tier = 'C';
  return {
    tier,
    label: rankTotal ? `行业排名 ${position}/${rankTotal}` : `行业排名 ${position}`,
    percentile,
    position,
    total: rankTotal,
    industryName: pickText(rating?.industryName, latest.industryName),
    source: 'longbridge',
  };
}

function normalizeLongbridgeRatings(ratings, institutionRating, institutionRatingDetail) {
  const summary = institutionRating?.summary || {};
  const latest = institutionRating?.latest || {};
  const evaluate = summary.evaluate || latest.evaluate || {};
  const target = summary.target || institutionRatingDetail?.target?.list?.[0]?.avgTarget;
  const distributionValues = [evaluate.strongBuy, evaluate.over, evaluate.buy, evaluate.hold, evaluate.under, evaluate.sell, evaluate.noOpinion]
    .map(toNumber)
    .filter((value) => value !== null);
  return {
    style: pickText(ratings?.styleTxtName),
    scale: pickText(ratings?.scaleTxtName),
    reportPeriod: pickText(ratings?.reportPeriodTxt),
    compositeLetter: pickText(ratings?.multiLetter),
    compositeScore: toNumber(ratings?.multiScore),
    compositeScoreChange: toNumber(ratings?.multiScoreChange),
    industryName: pickText(ratings?.industryName, latest.industryName),
    industryRank: normalizeRatingRank(ratings, institutionRating),
    recommendation: summary.recommend ?? null,
    targetPrice: toNumber(target),
    targetCurrency: pickText(summary.ccySymbol),
    updatedAt: pickText(summary.updatedAt, institutionRatingDetail?.target?.updatedAt),
    predictionAccuracy: pickText(institutionRatingDetail?.target?.predictionAccuracy),
    analystCount: toNumber(evaluate.total)
      ?? (distributionValues.length ? distributionValues.reduce((sum, value) => sum + value, 0) : null),
    distribution: {
      strongBuy: toNumber(evaluate.strongBuy ?? evaluate.over),
      buy: toNumber(evaluate.buy),
      hold: toNumber(evaluate.hold),
      underperform: toNumber(evaluate.under),
      sell: toNumber(evaluate.sell),
      noOpinion: toNumber(evaluate.noOpinion),
    },
    rawRatings: parseJsonMaybe(ratings?.ratingsJson, null),
  };
}

function normalizeIndustryDistribution(dist) {
  const metric = dist?.pe || dist?.pb || dist?.ps || null;
  return {
    pe: dist?.pe ? {
      current: toNumber(dist.pe.value),
      median: toNumber(dist.pe.median),
      low: toNumber(dist.pe.low),
      high: toNumber(dist.pe.high),
      ranking: pickText(dist.pe.ranking),
      rankIndex: toNumber(dist.pe.rankIndex ?? dist.pe.rank_index),
      rankTotal: toNumber(dist.pe.rankTotal ?? dist.pe.rank_total),
    } : null,
    pb: dist?.pb ? {
      current: toNumber(dist.pb.value),
      median: toNumber(dist.pb.median),
      low: toNumber(dist.pb.low),
      high: toNumber(dist.pb.high),
      ranking: pickText(dist.pb.ranking),
      rankIndex: toNumber(dist.pb.rankIndex ?? dist.pb.rank_index),
      rankTotal: toNumber(dist.pb.rankTotal ?? dist.pb.rank_total),
    } : null,
    ps: dist?.ps ? {
      current: toNumber(dist.ps.value),
      median: toNumber(dist.ps.median),
      low: toNumber(dist.ps.low),
      high: toNumber(dist.ps.high),
      ranking: pickText(dist.ps.ranking),
      rankIndex: toNumber(dist.ps.rankIndex ?? dist.ps.rank_index),
      rankTotal: toNumber(dist.ps.rankTotal ?? dist.ps.rank_total),
    } : null,
    primaryMetric: metric ? {
      ranking: pickText(metric.ranking),
      rankIndex: toNumber(metric.rankIndex ?? metric.rank_index),
      rankTotal: toNumber(metric.rankTotal ?? metric.rank_total),
    } : null,
  };
}

function normalizeIndustryPeers(payload, symbol) {
  const cleanSymbol = String(symbol || '').replace(/\.(US|HK|SH|SZ|CN|SG)$/i, '').toUpperCase();
  const peers = firstArray(payload?.list)
    .map((item) => ({
      symbol: pickText(item.symbol),
      name: pickText(item.name),
      currency: pickText(item.currency),
      marketCap: toNumber(item.marketValue ?? item.market_value),
      price: toNumber(item.priceClose ?? item.price_close),
      pe: toNumber(item.pe),
      pb: toNumber(item.pb),
      ps: toNumber(item.ps),
      roe: percentToRatio(item.roe),
      eps: toNumber(item.eps),
      bps: toNumber(item.bps),
      dividendYield: percentToRatio(item.divYld ?? item.div_yld),
    }))
    .filter((item) => item.symbol || item.name);
  const current = peers.find((item) => String(item.symbol || '').replace(/\.(US|HK|SH|SZ|CN|SG)$/i, '').toUpperCase() === cleanSymbol)
    || peers[0]
    || null;
  return {
    current,
    peers,
    count: peers.length,
  };
}

function normalizeShareholders(shareholder, topShareholder) {
  const topRaw = parseJsonMaybe(topShareholder?.data, null);
  const directList = firstArray(shareholder?.shareholderList)
    .map((item) => ({
      name: pickText(item.shareholderName),
      type: pickText(item.institutionType),
      percent: percentToRatio(item.percentOfShares),
      sharesChanged: toNumber(item.sharesChanged),
      reportDate: pickText(item.reportDate),
    }))
    .filter((item) => item.name);
  const topList = firstArray(topRaw?.list, topRaw?.data, Array.isArray(topRaw) ? topRaw : [])
    .map((item) => ({
      name: pickText(item.name, item.shareholder_name, item.shareholderName),
      percent: percentToRatio(pickNumber(item.percent, item.percent_of_shares)),
      rank: toNumber(item.rank),
      marketValue: pickNumber(item.market_value, item.shares_value),
    }))
    .filter((item) => item.name);
  const list = directList.length ? directList : topList;
  return {
    total: toNumber(shareholder?.total) ?? list.length,
    forwardUrl: pickText(shareholder?.forwardUrl),
    top: list.slice(0, 5),
    rawTop: topRaw,
  };
}

function normalizeExecutives(executive) {
  const group = firstArray(executive?.professionalList)[0] || {};
  return {
    total: toNumber(group.total),
    forwardUrl: pickText(group.forwardUrl),
    people: firstArray(group.professionals)
      .map((person) => ({
        name: pickText(person.nameZhcn, person.name, person.nameEn),
        title: pickText(person.title),
        biography: pickText(person.biography),
        photo: pickText(person.photo),
        wikiUrl: pickText(person.wikiUrl),
      }))
      .filter((person) => person.name || person.title)
      .slice(0, 5),
  };
}

function normalizeOperating(operating) {
  const latest = firstArray(operating?.list).find((item) => item.latest) || firstArray(operating?.list)[0] || null;
  if (!latest) return null;
  return {
    report: pickText(latest.report),
    title: pickText(latest.title),
    summary: cleanHtmlText(latest.txt),
    webUrl: pickText(latest.webUrl),
    indicators: firstArray(latest.financial?.indicators)
      .map((item) => ({
        key: pickText(item.fieldName),
        name: pickText(item.indicatorName),
        value: pickText(item.indicatorValue),
        yoy: pickText(item.yoy),
      }))
      .filter((item) => item.name || item.value)
      .slice(0, 8),
  };
}

function normalizeForecastEps(payload) {
  const item = firstArray(payload?.items)[0] || null;
  if (!item) return null;
  return {
    mean: toNumber(item.forecastEpsMean),
    median: toNumber(item.forecastEpsMedian),
    low: toNumber(item.forecastEpsLowest),
    high: toNumber(item.forecastEpsHighest),
    institutionTotal: toNumber(item.institutionTotal),
    institutionUp: toNumber(item.institutionUp),
    institutionDown: toNumber(item.institutionDown),
    startDate: item.forecastStartDate ? new Date(Number(item.forecastStartDate)).toISOString().slice(0, 10) : null,
    endDate: item.forecastEndDate ? new Date(Number(item.forecastEndDate)).toISOString().slice(0, 10) : null,
  };
}

function normalizeConsensus(payload) {
  const current = firstArray(payload?.list)[toNumber(payload?.currentIndex) ?? 0] || firstArray(payload?.list)[0] || null;
  if (!current) return null;
  return {
    currency: pickText(payload.currency),
    period: pickText(current.periodText, `${current.fiscalYear || ''}${current.fiscalPeriod || ''}`.trim()),
    details: firstArray(current.details)
      .map((item) => ({
        key: pickText(item.key),
        name: pickText(item.name),
        estimate: toNumber(item.estimate),
        actual: toNumber(item.actual),
        compDesc: pickText(item.compDesc),
        isReleased: Boolean(item.isReleased),
      }))
      .filter((item) => item.name)
      .slice(0, 8),
  };
}

function pickLatestFinancialValue(account) {
  const value = firstArray(account?.values)[0] || {};
  const raw = pickNumber(value.value, value.raw, value.amount, value.current, value.val);
  return {
    value: raw,
    display: pickText(value.value, value.raw, value.amount, value.current, value.val),
    period: pickText(value.period, value.report, value.fiscalPeriod),
    year: toNumber(value.year),
    ratio: normalizePercent(value.ratio),
    yoy: normalizePercent(value.yoy),
    fpEnd: value.fp_end ? new Date(Number(value.fp_end) * 1000).toISOString().slice(0, 10) : null,
  };
}

function normalizeReportKind(payload, kind, fallbackTitle) {
  const report = payload?.list?.[kind] || payload?.list?.[fallbackTitle] || payload?.[kind] || payload || {};
  const indicators = firstArray(report?.indicators, report?.list, report?.items, Array.isArray(report) ? report : []);
  const accounts = indicators.flatMap((indicator) => firstArray(indicator?.accounts, indicator?.items, indicator?.children));
  const rows = accounts
    .map((account) => {
      const latest = pickLatestFinancialValue(account);
      return {
        field: pickText(account.field, account.key, account.code),
        name: pickText(account.name, account.title, account.label, account.field),
        value: latest.value,
        display: latest.display,
        period: latest.period,
        year: latest.year,
        yoy: latest.yoy,
        percent: Boolean(account.percent),
        tip: cleanHtmlText(account.tip),
      };
    })
    .filter((item) => item.name || item.field);
  const primaryIndicator = indicators[0] || {};
  return {
    kind,
    title: pickText(primaryIndicator.title, fallbackTitle),
    shortTitle: pickText(primaryIndicator.short_title, kind),
    currency: pickText(primaryIndicator.currency),
    periods: firstArray(primaryIndicator.periods).slice(0, 6),
    rows: rows.slice(0, 14),
  };
}

function findFinancialMetric(reports, patterns) {
  const regexes = patterns.map((pattern) => new RegExp(pattern, 'i'));
  const rows = Object.values(reports || {}).flatMap((report) => report?.rows || []);
  const found = rows.find((row) => {
    const text = [row.field, row.name].filter(Boolean).join(' ');
    return regexes.some((regex) => regex.test(text));
  });
  return found?.value ?? null;
}

function normalizeFinancialReports(payload) {
  if (!payload) return null;
  const reports = {
    incomeStatement: normalizeReportKind(payload, 'IS', '利润表'),
    balanceSheet: normalizeReportKind(payload, 'BS', '资产负债表'),
    cashFlow: normalizeReportKind(payload, 'CF', '现金流量表'),
  };
  const cards = [
    {
      key: 'revenue',
      label: '营业收入',
      value: findFinancialMetric(reports, ['revenue', 'total.*revenue', '营业收入', '收入']),
      type: 'money',
    },
    {
      key: 'netIncome',
      label: '净利润',
      value: findFinancialMetric(reports, ['net.*income', 'net.*profit', 'profit.*attributable', '净利润', '净收入']),
      type: 'money',
    },
    {
      key: 'eps',
      label: 'EPS',
      value: findFinancialMetric(reports, ['^eps$', 'earnings.*share', '每股收益']),
      type: 'money',
    },
    {
      key: 'totalAssets',
      label: '总资产',
      value: findFinancialMetric(reports, ['total.*assets', '总资产']),
      type: 'money',
    },
    {
      key: 'totalLiabilities',
      label: '总负债',
      value: findFinancialMetric(reports, ['total.*liabil', '总负债']),
      type: 'money',
    },
    {
      key: 'operatingCashflow',
      label: '经营现金流',
      value: findFinancialMetric(reports, ['operat.*cash', 'cash.*operat', '经营.*现金']),
      type: 'money',
    },
  ].filter((item) => item.value !== null);
  return {
    reports,
    cards,
    periods: firstArray(
      reports.incomeStatement?.periods,
      reports.balanceSheet?.periods,
      reports.cashFlow?.periods
    ),
    hasReports: Object.values(reports).some((report) => report.rows.length > 0),
  };
}

function normalizeDividends(payload) {
  const items = firstArray(payload?.list, payload?.items, Array.isArray(payload) ? payload : [])
    .map((item) => ({
      id: pickText(item.id, `${item.exDate || ''}-${item.paymentDate || ''}`),
      desc: cleanHtmlText(pickText(item.desc, item.description, item.title)),
      recordDate: pickText(item.recordDate, item.record_date),
      exDate: pickText(item.exDate, item.ex_date),
      paymentDate: pickText(item.paymentDate, item.payment_date),
    }))
    .filter((item) => item.desc || item.exDate || item.paymentDate);
  return {
    total: items.length,
    latest: items[0] || null,
    items: items.slice(0, 5),
  };
}

function normalizeFundHolders(payload) {
  const items = firstArray(payload?.lists, payload?.list, payload?.items, Array.isArray(payload) ? payload : [])
    .map((item) => ({
      symbol: pickText(item.symbol, item.code),
      name: pickText(item.name),
      currency: pickText(item.currency),
      positionRatio: normalizePercent(item.positionRatio ?? item.position_ratio),
      reportDate: pickText(item.reportDate, item.report_date),
    }))
    .filter((item) => item.name || item.symbol);
  return {
    total: items.length,
    items: items.slice(0, 5),
  };
}

function normalizeCorpActions(payload) {
  const items = firstArray(payload?.items, payload?.list, Array.isArray(payload) ? payload : [])
    .map((item) => ({
      id: pickText(item.id, item.date),
      date: pickText(item.date, item.dateStr, item.exDate),
      dateText: pickText(item.dateStr, item.dateType),
      type: pickText(item.actType, item.action, item.type),
      desc: cleanHtmlText(pickText(item.actDesc, item.desc, item.description, item.action)),
      recent: Boolean(item.recent),
      liveTitle: pickText(item.live?.name),
    }))
    .filter((item) => item.date || item.desc || item.type);
  return {
    total: items.length,
    items: items.slice(0, 6),
  };
}

function normalizeInvestRelations(payload) {
  const items = firstArray(payload?.investSecurities, payload?.list, payload?.items, Array.isArray(payload) ? payload : [])
    .map((item) => ({
      symbol: pickText(item.symbol),
      name: pickText(item.companyNameZhcn, item.companyName, item.companyNameEn),
      currency: pickText(item.currency),
      percent: normalizePercent(item.percentOfShares ?? item.percent_of_shares),
      rank: pickText(item.sharesRank, item.shares_rank),
      marketValue: toNumber(item.sharesValue ?? item.shares_value),
    }))
    .filter((item) => item.name || item.symbol);
  return {
    forwardUrl: pickText(payload?.forwardUrl),
    items: items.slice(0, 6),
    total: items.length,
  };
}

function normalizeBuyback(payload) {
  const recent = payload?.recentBuybacks || payload?.recent_buybacks || {};
  const history = firstArray(payload?.buybackHistory, payload?.buyback_history)
    .map((item) => ({
      fiscalYear: pickText(item.fiscalYear, item.fiscal_year),
      fiscalYearRange: pickText(item.fiscalYearRange, item.fiscal_year_range),
      currency: pickText(item.currency),
      netBuyback: toNumber(item.netBuyback ?? item.net_buyback),
      netBuybackYield: normalizePercent(item.netBuybackYield ?? item.net_buyback_yield),
      netBuybackGrowthRate: normalizePercent(item.netBuybackGrowthRate ?? item.net_buyback_growth_rate),
    }))
    .filter((item) => item.fiscalYear || item.netBuyback !== null);
  const ratios = firstArray(payload?.buybackRatios, payload?.buyback_ratios)
    .map((item) => ({
      payoutRatio: normalizePercent(item.netBuybackPayoutRatio ?? item.net_buyback_payout_ratio),
      toCashflowRatio: normalizePercent(item.netBuybackToCashflowRatio ?? item.net_buyback_to_cashflow_ratio),
    }));
  return {
    recent: {
      currency: pickText(recent.currency),
      netBuybackTtm: toNumber(recent.netBuybackTtm ?? recent.net_buyback_ttm),
      netBuybackYieldTtm: normalizePercent(recent.netBuybackYieldTtm ?? recent.net_buyback_yield_ttm),
    },
    history: history.slice(0, 5),
    ratios: ratios.slice(0, 3),
  };
}

function normalizeValuationComparison(payload, symbol) {
  const peers = normalizeIndustryPeers(payload, symbol);
  return {
    ...peers,
    source: 'valuationComparison',
  };
}

function normalizeValuationRanking(detail, symbol, parsedRank = null) {
  const layoutMetrics = detail?.layouts || {};
  const metricKey = layoutMetrics.pe ? 'pe' : Object.keys(layoutMetrics).find((key) => layoutMetrics[key]?.groups);
  const groups = metricKey ? firstArray(layoutMetrics[metricKey]?.groups) : [];
  const stocks = detail?.stocks || {};
  const targetCounterId = toLongbridgeCounterId(symbol);
  const targetSymbol = toLongbridgeStockSymbol(symbol).toUpperCase();
  const flattened = groups
    .flatMap((group, groupIndex) => firstArray(group?.list).map((item, groupItemIndex) => ({
      item,
      groupIndex,
      groupItemIndex,
    })))
    .map(({ item, groupIndex, groupItemIndex }, index) => {
      const counterId = pickText(item.counter_id, item.counterId);
      const parsedCounter = parseLongbridgeCounterId(counterId);
      const stock = counterId ? stocks[counterId] || {} : {};
      const symbolText = parsedCounter?.symbol || pickText(item.symbol, item.ticker);
      const displaySymbol = parsedCounter?.displaySymbol || pickText(item.ticker, item.symbol);
      const metricValue = toNumber(item.value);
      const isCurrent = Boolean(
        (counterId && targetCounterId && counterId.toUpperCase() === targetCounterId.toUpperCase())
          || (symbolText && symbolText.toUpperCase() === targetSymbol)
      );
      return {
        counterId,
        symbol: symbolText,
        displaySymbol,
        name: pickText(item.name, stock.name, displaySymbol),
        marketCap: toNumber(stock.market_cap ?? stock.marketCap),
        metricKey,
        metricLabel: String(metricKey || 'pe').toUpperCase(),
        metricValue,
        pe: metricKey === 'pe' ? metricValue : null,
        growth: percentToRatio(item.growth),
        groupIndex,
        groupItemIndex,
        layoutIndex: index + 1,
        isCurrent,
        source: 'valuationRanking',
      };
    })
    .filter((item) => item.counterId || item.symbol || item.name);

  if (!flattened.length) {
    return {
      source: 'valuationDetail',
      metricKey: metricKey || 'pe',
      metricLabel: String(metricKey || 'pe').toUpperCase(),
      peers: [],
      count: 0,
      rankableCount: 0,
      current: null,
      currentRank: parsedRank || null,
    };
  }

  const rankable = flattened
    .filter((item) => item.metricValue !== null && item.metricValue > 0)
    .sort((a, b) => a.metricValue - b.metricValue);
  const rankMap = new Map(rankable.map((item, index) => [item.counterId || item.symbol || `${item.name}-${item.layoutIndex}`, index + 1]));
  const currentRank = parsedRank || null;
  const total = currentRank?.total || flattened.length;
  const peers = [
    ...rankable,
    ...flattened
      .filter((item) => !(item.metricValue !== null && item.metricValue > 0))
      .sort((a, b) => {
        if (a.metricValue === null && b.metricValue === null) return a.layoutIndex - b.layoutIndex;
        if (a.metricValue === null) return 1;
        if (b.metricValue === null) return -1;
        return b.metricValue - a.metricValue;
      }),
  ].map((item) => {
    const rankKey = item.counterId || item.symbol || `${item.name}-${item.layoutIndex}`;
    const rank = item.isCurrent && currentRank?.position
      ? currentRank.position
      : rankMap.get(rankKey) || null;
    return {
      ...item,
      rank,
      rankTotal: total,
    };
  });
  const current = peers.find((item) => item.isCurrent) || null;

  return {
    source: 'valuationDetail',
    metricKey: metricKey || 'pe',
    metricLabel: String(metricKey || 'pe').toUpperCase(),
    median: toNumber(detail?.peers?.[metricKey]?.industry_median ?? detail?.overview?.metrics?.[metricKey]?.industry_median),
    peers,
    count: flattened.length,
    rankableCount: rankable.length,
    current,
    currentRank,
  };
}

function normalizeLongbridgeCompany(symbol, company = {}, valuation = null, extras = {}) {
  const metrics = valuation?.metrics || {};
  const pe = latestValuationValue(metrics.pe);
  const pb = latestValuationValue(metrics.pb);
  const ps = latestValuationValue(metrics.ps);
  const dividendYield = latestValuationValue(metrics.dvd_yld);
  const industryValuation = normalizeIndustryValuation(extras.industryValuation, symbol);
  const financialSnapshot = normalizeFinancialSnapshot(extras.financialSnapshot || {});
  const sdkStatic = normalizeLongbridgeStatic(extras.staticInfo || null);
  const sdkRatings = normalizeLongbridgeRatings(
    extras.ratings,
    extras.institutionRating,
    extras.institutionRatingDetail
  );
  const industryDistribution = normalizeIndustryDistribution(extras.industryDistribution || null);
  const industryPeers = normalizeIndustryPeers(extras.industryPeers || extras.industryValuation, symbol);
  const shareholders = normalizeShareholders(extras.shareholder, extras.shareholderTop);
  const executives = normalizeExecutives(extras.executive);
  const operating = normalizeOperating(extras.operating);
  const forecastEps = normalizeForecastEps(extras.forecastEps);
  const consensus = normalizeConsensus(extras.consensus);
  const financialReports = normalizeFinancialReports(extras.financialReport);
  const dividends = normalizeDividends(extras.dividend || extras.dividendDetail);
  const fundHolders = normalizeFundHolders(extras.fundHolder);
  const corpActions = normalizeCorpActions(extras.corpAction);
  const investRelations = normalizeInvestRelations(extras.investRelation);
  const buyback = normalizeBuyback(extras.buyback);
  const valuationComparison = normalizeValuationComparison(extras.valuationComparison, symbol);
  const textIndustryRank = parseIndustryRankFromText(
    extras.valuationDetail?.overview?.ai_summary,
    ...Object.values(extras.valuationDetail?.overview?.metrics || {}).map((metric) => metric?.desc),
    ...Object.values(extras.valuationDetail?.history?.metrics || {}).map((metric) => metric?.desc),
    ...Object.values(valuation?.metrics || {}).map((metric) => metric?.desc),
    extras.valuationDetail?.desc,
    extras.valuationDetail?.description,
    extras.valuationDetail?.summary
  );
  const valuationRanking = normalizeValuationRanking(extras.valuationDetail, symbol, textIndustryRank);
  const valuationDistributionRank = industryDistribution.primaryMetric && {
    tier: 'B',
    label: industryDistribution.primaryMetric.rankTotal
      ? `估值分位 ${industryDistribution.primaryMetric.rankIndex}/${industryDistribution.primaryMetric.rankTotal}`
      : '估值分位',
    percentile: industryDistribution.primaryMetric.ranking ? toNumber(industryDistribution.primaryMetric.ranking) : null,
    position: industryDistribution.primaryMetric.rankIndex,
    total: industryDistribution.primaryMetric.rankTotal,
    source: 'longbridge',
  };
  const industryRank = sdkRatings.industryRank || textIndustryRank || valuationDistributionRank;
  const revenueGrowth = toNumber(company?.revenue_growth);
  const profileText = pickText(company.profile, company.business_scope, company.description);
  const financialCards = financialReports?.cards || [];
  const financialCardValue = (key) => financialCards.find((item) => item.key === key)?.value ?? null;
  return {
    symbol: toLongbridgeStockSymbol(symbol),
    staticInfo: {
      symbol: toLongbridgeStockSymbol(symbol),
      nameCn: pickText(sdkStatic.nameCn, company.name, company.company_name),
      nameEn: pickText(sdkStatic.nameEn, company.name_en, company.company_name_en),
      nameHk: pickText(sdkStatic.nameHk, company.name_hk),
      exchange: pickText(sdkStatic.exchange, company.market, company.region),
      currency: pickText(sdkStatic.currency, company.currency),
      lotSize: sdkStatic.lotSize ?? toNumber(company.lot_size),
      totalShares: sdkStatic.totalShares ?? toNumber(company.total_shares),
      circulatingShares: sdkStatic.circulatingShares ?? toNumber(company.float_shares ?? company.circulating_shares),
      eps: sdkStatic.eps ?? toNumber(company.eps),
      epsTtm: sdkStatic.epsTtm ?? toNumber(company.eps_ttm),
      bps: sdkStatic.bps ?? toNumber(company.bps),
      dividendPerShare: sdkStatic.dividendPerShare ?? toNumber(company.dividend_per_share),
      stockDerivatives: sdkStatic.stockDerivatives || [],
      board: pickNonNumericText(company.category, company.sector, sdkStatic.board),
    },
    quote: normalizeLongbridgeQuote(extras.quote),
    fundamentals: {
      marketCap: industryValuation.marketCap ?? toNumber(company.market_cap),
      floatMarketCap: industryValuation.floatMarketCap ?? toNumber(company.float_market_cap),
      trailingPE: industryValuation.trailingPE ?? pe,
      priceToBook: industryValuation.priceToBook ?? pb,
      priceToSales: industryValuation.priceToSales ?? ps,
      dividendYield: industryValuation.dividendYield ?? dividendYield,
      returnOnEquity: industryValuation.returnOnEquity ?? financialSnapshot.returnOnEquity,
      profitMargins: industryValuation.profitMargins ?? financialSnapshot.profitMargins,
      totalRevenue: industryValuation.totalRevenue ?? financialSnapshot.revenue ?? financialCardValue('revenue'),
      netIncome: industryValuation.netIncome ?? financialSnapshot.netIncome ?? financialCardValue('netIncome'),
      revenueGrowth: financialSnapshot.revenueGrowth,
      netIncomeGrowth: financialSnapshot.netIncomeGrowth,
      operatingCashflow: financialSnapshot.operatingCashflow ?? financialCardValue('operatingCashflow'),
      totalAssets: financialSnapshot.totalAssets ?? financialCardValue('totalAssets'),
      totalLiabilities: financialSnapshot.totalLiabilities ?? financialCardValue('totalLiabilities'),
      debtToAssets: financialSnapshot.debtToAssets,
      eps: industryValuation.eps ?? financialSnapshot.eps ?? financialCardValue('eps'),
      bps: industryValuation.bps,
      forecastEpsMean: forecastEps?.mean ?? null,
      targetPrice: sdkRatings.targetPrice ?? null,
    },
    company: {
      name: pickText(company.name, company.company_name),
      companyName: pickText(company.company_name, company.name),
      founded: pickText(company.founded),
      listingDate: pickText(company.listing_date),
      market: pickText(company.market),
      region: pickText(company.region),
      address: pickText(company.address),
      officeAddress: pickText(company.office_address),
      website: pickText(company.website),
      issuePrice: toNumber(company.issue_price),
      sharesOffered: toNumber(company.shares_offered),
      chairman: pickText(company.chairman),
      manager: pickText(company.manager),
      employees: toNumber(company.employees),
      phone: pickText(company.Phone, company.phone),
      email: pickText(company.email),
      ticker: pickText(company.ticker),
      icon: pickText(company.icon),
      profile: profileText,
      adsRatio: pickText(company.ads_ratio),
      sector: pickNonNumericText(company.sector),
      revenueGrowth,
      industryRank,
      industryName: pickText(sdkRatings.industryName, industryRank?.industryName),
      valuationSummary: pickValuationSummary(extras.valuationDetail, valuation),
      earningsSummary: financialSnapshot.reportSummary,
      financialPeriod: financialSnapshot.financialPeriod,
      ratings: sdkRatings,
      industryDistribution,
      industryPeers,
      shareholders,
      executives,
      operating,
      forecastEps,
      consensus,
      financialReports,
      dividends,
      fundHolders,
      corpActions,
      investRelations,
      buyback,
      valuationComparison,
      valuationRanking,
      dataSources: {
        company: hasPayload(company),
        valuation: hasPayload(valuation),
        industryValuation: hasPayload(extras.industryValuation),
        industryDistribution: hasPayload(extras.industryDistribution),
        valuationDetail: hasPayload(extras.valuationDetail),
        financialSnapshot: hasPayload(extras.financialSnapshot),
        financialReport: Boolean(financialReports?.hasReports),
        quote: hasPayload(extras.quote),
        staticInfo: hasPayload(extras.staticInfo),
        institutionRating: hasPayload(extras.institutionRating),
        institutionRatingDetail: hasPayload(extras.institutionRatingDetail),
        ratings: hasPayload(extras.ratings),
        shareholder: hasPayload(extras.shareholder),
        shareholderTop: hasPayload(extras.shareholderTop),
        executive: hasPayload(extras.executive),
        operating: hasPayload(extras.operating),
        forecastEps: hasPayload(extras.forecastEps),
        consensus: hasPayload(extras.consensus),
        dividend: Boolean(dividends?.total),
        dividendDetail: hasPayload(extras.dividendDetail),
        fundHolder: Boolean(fundHolders?.total),
        corpAction: Boolean(corpActions?.total),
        investRelation: Boolean(investRelations?.total || investRelations?.forwardUrl),
        buyback: Boolean(buyback?.recent?.netBuybackTtm !== null || buyback?.history?.length),
        valuationComparison: Boolean(valuationComparison?.peers?.length),
        valuationRanking: Boolean(valuationRanking?.peers?.length),
      },
      dataErrors: extras.dataErrors || {},
    },
    provider: 'Longbridge HTTP',
  };
}

export async function fetchLongbridgeStockSnapshot(symbol, credentials) {
  if (!hasLongbridgeCredentials(credentials)) return null;
  const counterId = toLongbridgeCounterId(symbol);
  if (!counterId) return null;

  const [
    companyResult,
    valuationResult,
    industryValuationResult,
    industryDistributionResult,
    valuationDetailResult,
    financialSnapshotResult,
  ] = await Promise.allSettled([
    requestLongbridge('/v1/quote/comp-overview', credentials, {
      query: { counter_id: counterId },
    }),
    requestLongbridge('/v1/quote/valuation', credentials, {
      query: {
        counter_id: counterId,
        indicator: 'pe',
        range: '1',
      },
    }),
    requestLongbridge('/v1/quote/industry-valuation-comparison', credentials, {
      query: { counter_id: counterId },
    }),
    requestLongbridge('/v1/quote/industry-valuation-distribution', credentials, {
      query: { counter_id: counterId },
    }),
    requestLongbridge('/v1/quote/valuation/detail', credentials, {
      query: { counter_id: counterId },
    }),
    requestLongbridge('/v1/quote/financials/earnings-snapshot', credentials, {
      query: { counter_id: counterId },
    }),
  ]);
  const company = companyResult.status === 'fulfilled' ? companyResult.value : null;
  if (!company) {
    const reason = companyResult.status === 'rejected' ? companyResult.reason?.message : '长桥公司画像为空';
    throw new Error(reason || '长桥公司画像暂不可用');
  }
  const mergedDataErrors = {};
  if (companyResult.status === 'rejected') {
    mergedDataErrors.httpCompany = companyResult.reason?.message || '长桥 HTTP 公司画像失败';
  }
  if (valuationResult.status === 'rejected') {
    mergedDataErrors.httpValuation = valuationResult.reason?.message || '长桥 HTTP 估值失败';
  }
  if (industryValuationResult.status === 'rejected') {
    mergedDataErrors.httpIndustryValuation = industryValuationResult.reason?.message || '长桥 HTTP 同业估值失败';
  }
  if (industryDistributionResult.status === 'rejected') {
    mergedDataErrors.httpIndustryDistribution = industryDistributionResult.reason?.message || '长桥 HTTP 行业估值分布失败';
  }
  if (valuationDetailResult.status === 'rejected') {
    mergedDataErrors.httpValuationDetail = valuationDetailResult.reason?.message || '长桥 HTTP 估值详情失败';
  }
  if (financialSnapshotResult.status !== 'fulfilled' && financialSnapshotResult.status === 'rejected') {
    mergedDataErrors.httpFinancialSnapshot = financialSnapshotResult.reason?.message || '长桥 HTTP 财报快照失败';
  }
  return normalizeLongbridgeCompany(
    symbol,
    company,
    valuationResult.status === 'fulfilled' ? valuationResult.value : null,
    {
      industryValuation: industryValuationResult.status === 'fulfilled' ? industryValuationResult.value : null,
      industryDistribution: industryDistributionResult.status === 'fulfilled' ? industryDistributionResult.value : null,
      valuationDetail: valuationDetailResult.status === 'fulfilled' ? valuationDetailResult.value : null,
      financialSnapshot: financialSnapshotResult.status === 'fulfilled' ? financialSnapshotResult.value : null,
      dataErrors: mergedDataErrors,
    }
  );
}

export async function fetchLongbridgeOptionQuote(contractSymbol, credentials) {
  if (!hasLongbridgeCredentials(credentials)) return null;
  const lbSymbol = toLongbridgeOptionSymbol(contractSymbol);
  if (!lbSymbol) return null;
  return null;
}
