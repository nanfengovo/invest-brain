function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value?.toNumber === 'function') {
    const number = value.toNumber();
    return Number.isFinite(number) ? number : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value?.toString === 'function') {
    const text = value.toString();
    return text && text !== '[object Object]' ? text : null;
  }
  return null;
}

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

async function createQuoteContext(credentials) {
  const { Config, QuoteContext } = await import('longbridge');
  const config = Config.fromApikey(credentials.appKey, credentials.appSecret, credentials.accessToken, {
    enablePrintQuotePackages: false,
  });
  return QuoteContext.new(config);
}

export async function fetchLongbridgeStockSnapshot(symbol, credentials) {
  if (!hasLongbridgeCredentials(credentials)) return null;

  const lbSymbol = toLongbridgeStockSymbol(symbol);
  if (!lbSymbol) return null;

  const ctx = await createQuoteContext(credentials);
  const [staticRows, quoteRows] = await Promise.all([
    ctx.staticInfo([lbSymbol]),
    ctx.quote([lbSymbol]).catch(() => []),
  ]);
  const staticInfo = staticRows?.[0] || null;
  const quote = quoteRows?.[0] || null;
  if (!staticInfo && !quote) return null;

  const totalShares = toNumber(staticInfo?.totalShares);
  const circulatingShares = toNumber(staticInfo?.circulatingShares);
  const lastDone = toNumber(quote?.lastDone);
  const prevClose = toNumber(quote?.prevClose);
  const dayChange = lastDone !== null && prevClose ? lastDone - prevClose : null;
  const dayChangePct = lastDone !== null && prevClose ? lastDone / prevClose - 1 : null;
  const epsTtm = toNumber(staticInfo?.epsTtm);
  const bps = toNumber(staticInfo?.bps);

  return {
    provider: 'Longbridge',
    symbol: lbSymbol,
    staticInfo: {
      symbol: staticInfo?.symbol || lbSymbol,
      nameCn: staticInfo?.nameCn || '',
      nameEn: staticInfo?.nameEn || '',
      nameHk: staticInfo?.nameHk || '',
      exchange: staticInfo?.exchange || '',
      currency: staticInfo?.currency || '',
      lotSize: toNumber(staticInfo?.lotSize),
      totalShares,
      circulatingShares,
      hkShares: toNumber(staticInfo?.hkShares),
      eps: toNumber(staticInfo?.eps),
      epsTtm,
      bps,
      dividendPerShare: toNumber(staticInfo?.dividendYield),
      stockDerivatives: (staticInfo?.stockDerivatives || []).map((item) => String(item)),
      board: String(staticInfo?.board || ''),
    },
    quote: quote ? {
      price: lastDone,
      previousClose: prevClose,
      dayChange,
      dayChangePct,
      dayOpen: toNumber(quote.open),
      dayHigh: toNumber(quote.high),
      dayLow: toNumber(quote.low),
      dayVolume: toNumber(quote.volume),
      turnover: toNumber(quote.turnover),
      timestamp: toDateString(quote.timestamp),
      tradeStatus: String(quote.tradeStatus || ''),
    } : null,
    fundamentals: {
      marketCap: totalShares && lastDone ? totalShares * lastDone : null,
      floatMarketCap: circulatingShares && lastDone ? circulatingShares * lastDone : null,
      trailingPE: epsTtm && lastDone ? lastDone / epsTtm : null,
      priceToBook: bps && lastDone ? lastDone / bps : null,
    },
  };
}

export async function fetchLongbridgeOptionQuote(contractSymbol, credentials) {
  if (!hasLongbridgeCredentials(credentials)) return null;

  const lbSymbol = toLongbridgeOptionSymbol(contractSymbol);
  if (!lbSymbol) return null;

  const ctx = await createQuoteContext(credentials);
  const rows = await ctx.optionQuote([lbSymbol]);
  const option = rows?.[0] || null;
  if (!option) return null;

  const last = toNumber(option.lastDone);
  const prevClose = toNumber(option.prevClose);
  return {
    contractSymbol: String(contractSymbol || '').replace(/^OPTION_/i, '').trim().toUpperCase(),
    longbridgeSymbol: option.symbol || lbSymbol,
    underlying: option.underlyingSymbol || null,
    type: String(option.contractType || '').toUpperCase().includes('PUT') ? 'PUT' : 'CALL',
    expiration: toDateString(option.expiryDate),
    strike: toNumber(option.strikePrice),
    last,
    bid: null,
    ask: null,
    mark: last,
    change: last !== null && prevClose ? last - prevClose : null,
    percentChange: last !== null && prevClose ? (last / prevClose - 1) * 100 : null,
    volume: toNumber(option.volume),
    openInterest: toNumber(option.openInterest),
    impliedVolatility: toNumber(option.impliedVolatility),
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    rho: null,
    inTheMoney: null,
    contractMultiplier: toNumber(option.contractMultiplier),
    contractSize: toNumber(option.contractSize),
    historicalVolatility: toNumber(option.historicalVolatility),
    updated: toDateString(option.timestamp),
    provider: 'Longbridge',
  };
}
