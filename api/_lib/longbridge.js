import crypto from 'node:crypto';

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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickText(...values) {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || null;
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

export function toLongbridgeStockSymbol(symbol) {
  const text = String(symbol || '').trim().toUpperCase();
  if (!text) return '';
  if (/\.(US|HK|CN|SH|SZ|SG)$/i.test(text)) return text;
  if (/^\d{5}$/.test(text)) return `${text}.HK`;
  if (/^(SH|SZ)\d{6}$/.test(text)) return `${text.slice(2)}.${text.slice(0, 2)}`;
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

function normalizeLongbridgeCompany(symbol, company = {}, valuation = null) {
  const metrics = valuation?.metrics || {};
  const pe = latestValuationValue(metrics.pe);
  const pb = latestValuationValue(metrics.pb);
  const dividendYield = latestValuationValue(metrics.dvd_yld);
  const revenueGrowth = toNumber(company?.revenue_growth);
  const profileText = pickText(company.profile, company.business_scope, company.description);
  return {
    symbol: toLongbridgeStockSymbol(symbol),
    staticInfo: {
      symbol: toLongbridgeStockSymbol(symbol),
      nameCn: pickText(company.name, company.company_name),
      nameEn: pickText(company.name_en, company.company_name_en),
      nameHk: pickText(company.name_hk),
      exchange: pickText(company.market, company.region),
      currency: pickText(company.currency),
      lotSize: toNumber(company.lot_size),
      totalShares: toNumber(company.total_shares),
      circulatingShares: toNumber(company.float_shares ?? company.circulating_shares),
      eps: toNumber(company.eps),
      epsTtm: toNumber(company.eps_ttm),
      bps: toNumber(company.bps),
      dividendPerShare: toNumber(company.dividend_per_share),
      stockDerivatives: [],
      board: pickText(company.category, company.sector),
    },
    quote: null,
    fundamentals: {
      marketCap: toNumber(company.market_cap),
      floatMarketCap: toNumber(company.float_market_cap),
      trailingPE: pe,
      priceToBook: pb,
      dividendYield,
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
      sector: company.sector ?? null,
      revenueGrowth,
    },
    provider: 'Longbridge HTTP',
  };
}

export async function fetchLongbridgeStockSnapshot(symbol, credentials) {
  if (!hasLongbridgeCredentials(credentials)) return null;
  const counterId = toLongbridgeCounterId(symbol);
  if (!counterId) return null;

  const [companyResult, valuationResult] = await Promise.allSettled([
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
  ]);
  const company = companyResult.status === 'fulfilled' ? companyResult.value : null;
  if (!company) {
    const reason = companyResult.status === 'rejected' ? companyResult.reason?.message : '长桥公司画像为空';
    throw new Error(reason || '长桥公司画像暂不可用');
  }
  return normalizeLongbridgeCompany(
    symbol,
    company,
    valuationResult.status === 'fulfilled' ? valuationResult.value : null
  );
}

export async function fetchLongbridgeOptionQuote(contractSymbol, credentials) {
  if (!hasLongbridgeCredentials(credentials)) return null;
  const lbSymbol = toLongbridgeOptionSymbol(contractSymbol);
  if (!lbSymbol) return null;
  throw new Error('长桥期权报价需要单独购买 OPRA US Options Quotes（OpenAPI）权限；当前请优先使用 MarketData.app 单合约报价。');
}
