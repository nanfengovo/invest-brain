import { fetchWithTimeout, YAHOO_HEADERS } from './_lib/yahoo.js';
import {
  fetchLongbridgeOptionQuote,
  getLongbridgeCredentials,
  hasLongbridgeCredentials,
} from './_lib/longbridge.js';
import { getNewYorkDateParts, getUsMarketStatus } from '../src/utils/marketHours.js';

export const config = {
  maxDuration: 20,
};

const CACHE_TTL_MS = 3 * 60 * 1000;
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;
const optionsCache = globalThis.__INVEST_BRAIN_OPTIONS_CHAIN_CACHE__ || new Map();
globalThis.__INVEST_BRAIN_OPTIONS_CHAIN_CACHE__ = optionsCache;
const pendingOptionsRequests = globalThis.__INVEST_BRAIN_OPTIONS_CHAIN_PENDING__ || new Map();
globalThis.__INVEST_BRAIN_OPTIONS_CHAIN_PENDING__ = pendingOptionsRequests;

const PREVIOUS_EOD_LOOKBACK_LIMIT = 14;

function hashCredential(value) {
  const text = String(value || '');
  if (!text) return '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function getCachedOptions(cacheKey, maxAgeMs = CACHE_TTL_MS) {
  const cached = optionsCache.get(cacheKey);
  if (!cached || Date.now() - cached.fetchedAt > maxAgeMs) return null;
  return cached;
}

function markOptionsCache(payload, cacheMeta = {}) {
  return {
    ...payload,
    dataSource: {
      ...(payload?.dataSource || {}),
      cache: cacheMeta,
    },
  };
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toDateStringFromUnix(seconds) {
  if (!seconds) return null;
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

function toNewYorkDateStringFromUnix(seconds) {
  const timestamp = Number(seconds);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return getNewYorkDateParts(new Date(timestamp * 1000)).key;
}

function addIsoDays(dateKey, delta) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function getPreviousUsTradingDate(beforeDateKey) {
  let candidate = addIsoDays(beforeDateKey, -1);
  for (let index = 0; candidate && index < PREVIOUS_EOD_LOOKBACK_LIMIT; index += 1) {
    const status = getUsMarketStatus(new Date(`${candidate}T17:00:00Z`));
    if (status.isTradingDay) return candidate;
    candidate = addIsoDays(candidate, -1);
  }
  return null;
}

function normalizeExpirationDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isFinite(Number(value))) return toDateStringFromUnix(Number(value));
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toUnixExpiration(date) {
  if (!date) return null;
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

function getArrayValue(payload, key, index) {
  const value = payload?.[key];
  return Array.isArray(value) ? value[index] : value;
}

function parseOCCSymbol(value) {
  const text = normalizeOptionContractKey(value);
  const match = text.match(/^([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return {};
  const [, underlying, yymmdd, side, strikeRaw] = match;
  const expiration = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  return {
    underlying,
    expiration,
    type: side === 'P' ? 'PUT' : 'CALL',
    strike: Number(strikeRaw) / 1000,
  };
}

export function normalizeOptionContractKey(value) {
  return String(value || '')
    .replace(/^OPTION_/i, '')
    .replace(/^O:/i, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function filterOptionPayloadByContract(payload, contract) {
  const target = normalizeOptionContractKey(contract);
  if (!target) return payload;

  const parsed = parseOCCSymbol(target);
  const options = Array.isArray(payload?.options) ? payload.options : [];
  const matchedOptions = options.filter((option) => {
    const optionKey = normalizeOptionContractKey(option?.contractSymbol || option?.symbol || option?.asset_id);
    return optionKey === target;
  });
  const expirations = Array.from(new Set(
    matchedOptions.map((option) => option.expiration).filter(Boolean)
  )).sort();
  const nextDataSource = payload?.dataSource
    ? {
      ...payload.dataSource,
      requestedContract: target,
      optionCount: matchedOptions.length,
    }
    : null;

  return {
    ...payload,
    selectedExpiration: matchedOptions[0]?.expiration || parsed.expiration || payload?.selectedExpiration || null,
    expirations: expirations.length ? expirations : (parsed.expiration ? [parsed.expiration] : (payload?.expirations || [])),
    options: matchedOptions,
    ...(matchedOptions.length
      ? {}
      : {
        message: payload?.message || `${payload?.provider || '数据源'} 未返回 ${target} 的单合约报价，请检查合约、到期日或数据源权限。`,
      }),
    ...(nextDataSource ? { dataSource: nextDataSource } : {}),
  };
}

function markPrice(bid, ask, last) {
  const b = toNumber(bid);
  const a = toNumber(ask);
  if (b !== null && a !== null && a >= b) return Number(((a + b) / 2).toFixed(4));
  return toNumber(last);
}

function getOptionReferencePrice(option) {
  return toNumber(option?.mark ?? option?.last ?? option?.bid);
}

export function attachOptionDailyChange(option, previousOption, previousDate, previousError = null) {
  const currentPrice = getOptionReferencePrice(option);
  const previousClose = getOptionReferencePrice(previousOption);
  const base = {
    ...option,
    previousClose,
    previousCloseDate: previousDate || null,
    previousCloseSource: previousClose !== null ? 'marketdata_eod_mark' : null,
    dayChangeSource: previousClose !== null ? 'marketdata_previous_eod' : 'missing_previous_eod',
    dayChangeNote: previousClose !== null
      ? '日变动使用当前 Mark/Last 与上一交易日 EOD Mark/Last 计算。'
      : (previousError || 'MarketData.app 未返回上一交易日 EOD 基准，暂不能计算期权日收益。'),
  };

  if (currentPrice === null || previousClose === null || previousClose === 0) {
    return {
      ...base,
      change: null,
      percentChange: null,
    };
  }

  const change = currentPrice - previousClose;
  return {
    ...base,
    change: Number(change.toFixed(4)),
    percentChange: Number(((change / previousClose) * 100).toFixed(4)),
  };
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

function normalizeMarketDataOption(payload, index, fallbackUnderlying, fallbackExpiration) {
  const contractSymbol = String(getArrayValue(payload, 'optionSymbol', index) || '').trim().toUpperCase();
  const parsed = parseOCCSymbol(contractSymbol);
  const bid = toNumber(getArrayValue(payload, 'bid', index));
  const ask = toNumber(getArrayValue(payload, 'ask', index));
  const last = toNumber(getArrayValue(payload, 'last', index));
  const expirationValue = getArrayValue(payload, 'expiration', index);
  const side = String(getArrayValue(payload, 'side', index) || parsed.type || '').toUpperCase();
  const inTheMoney = getArrayValue(payload, 'inTheMoney', index);

  return {
    contractSymbol,
    underlying: getArrayValue(payload, 'underlying', index) || parsed.underlying || fallbackUnderlying,
    type: side === 'PUT' ? 'PUT' : 'CALL',
    expiration: toDateStringFromUnix(expirationValue) || parsed.expiration || fallbackExpiration,
    strike: toNumber(getArrayValue(payload, 'strike', index)) ?? parsed.strike ?? null,
    last,
    bid,
    ask,
    mark: toNumber(getArrayValue(payload, 'mid', index)) ?? markPrice(bid, ask, last),
    change: null,
    percentChange: null,
    volume: toNumber(getArrayValue(payload, 'volume', index)),
    openInterest: toNumber(getArrayValue(payload, 'openInterest', index)),
    underlyingPrice: toNumber(getArrayValue(payload, 'underlyingPrice', index)),
    impliedVolatility: toNumber(getArrayValue(payload, 'iv', index)),
    delta: toNumber(getArrayValue(payload, 'delta', index)),
    gamma: toNumber(getArrayValue(payload, 'gamma', index)),
    theta: toNumber(getArrayValue(payload, 'theta', index)),
    vega: toNumber(getArrayValue(payload, 'vega', index)),
    rho: null,
    inTheMoney: typeof inTheMoney === 'boolean' ? inTheMoney : null,
    intrinsicValue: toNumber(getArrayValue(payload, 'intrinsicValue', index)),
    extrinsicValue: toNumber(getArrayValue(payload, 'extrinsicValue', index)),
    updated: toNumber(getArrayValue(payload, 'updated', index)),
    quoteDate: toNewYorkDateStringFromUnix(getArrayValue(payload, 'updated', index)),
    previousClose: null,
    previousCloseDate: null,
    previousCloseSource: null,
    dayChangeSource: null,
    dayChangeNote: null,
    provider: 'MarketData.app',
  };
}

function isMarketDataSuccess(response) {
  return response.status === 200 || response.status === 203;
}

function getMarketDataErrorMessage(response, scope = '期权数据') {
  const status = Number(response?.status);
  if (status === 401 || status === 403) {
    return `MarketData.app ${scope}权限不足或 Token 不可用；请检查 Token、试用额度、套餐和 OPRA 授权。`;
  }
  if (status === 429) {
    return `MarketData.app ${scope}请求过于频繁或额度已用尽；请稍后重试，或降低刷新频率/升级套餐。`;
  }
  if (status >= 500) {
    return `MarketData.app ${scope}服务暂时不可用，请稍后重试。`;
  }
  return `MarketData.app ${scope}请求失败（HTTP ${status || '未知'}）。`;
}

function buildMarketDataSourceMeta(response, options = [], kind = 'option_chain') {
  const updatedValues = options
    .map((option) => toNumber(option.updated))
    .filter((value) => value !== null);
  const latestUpdated = updatedValues.length ? Math.max(...updatedValues) : null;
  return {
    provider: 'MarketData.app',
    endpoint: kind,
    httpStatus: response?.status || null,
    isRealApiData: true,
    realTimeStatus: response?.status === 203 ? 'LIMITED_ENTITLEMENT' : 'ENTITLEMENT_DEPENDENT',
    dataMode: response?.status === 203 ? 'delayed_or_historical' : 'current_or_delayed',
    quoteUpdatedAt: latestUpdated,
    optionCount: options.length,
    note: response?.status === 203
      ? 'MarketData.app 已返回真实期权数据，但当前权限不是实时 OPRA，通常为延迟或历史数据。'
      : 'MarketData.app 已返回真实期权数据；是否实时取决于账号套餐、用户类型和 OPRA 授权。',
  };
}

async function fetchMarketDataExpirations(symbol, headers) {
  const expirationsUrl = `https://api.marketdata.app/v1/options/expirations/${encodeURIComponent(symbol)}/`;
  const response = await fetchWithTimeout(expirationsUrl, { headers }, 6_000);
  const json = await response.json().catch(() => ({}));
  if (response.status === 404 || json.s === 'no_data') {
    return {
      expirations: [],
      updated: null,
    };
  }
  if (!isMarketDataSuccess(response)) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('MarketData.app 到期日权限不足或 Token 不可用，请检查设置中的 Token。');
    }
    throw new Error(getMarketDataErrorMessage(response, '到期日'));
  }
  return {
    expirations: (json.expirations || [])
      .map(normalizeExpirationDate)
      .filter(Boolean)
      .sort(),
    updated: toNumber(json.updated),
    httpStatus: response.status,
  };
}

async function fetchMarketDataApp(symbol, expiration, token, filters = {}) {
  const headers = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const contractSymbol = String(filters.contract || '').replace(/^OPTION_/i, '').trim().toUpperCase();
  const contractDetails = parseOCCSymbol(contractSymbol);

  if (contractSymbol) {
    const quoteUrl = `https://api.marketdata.app/v1/options/quotes/${encodeURIComponent(contractSymbol)}/`;
    const quoteResponse = await fetchWithTimeout(quoteUrl, { headers }, 6_000);
    const quoteJson = await quoteResponse.json().catch(() => ({}));
    if (quoteResponse.status === 404 || quoteJson.s === 'no_data') {
      return {
        expirations: contractDetails.expiration ? [contractDetails.expiration] : [],
        selectedExpiration: contractDetails.expiration || expiration || null,
        options: [],
        message: quoteJson.errmsg || 'MarketData.app 未返回该期权合约报价。',
      };
    }
    if (!isMarketDataSuccess(quoteResponse)) {
      throw new Error(getMarketDataErrorMessage(quoteResponse, '期权报价'));
    }
    let option = normalizeMarketDataOption(quoteJson, 0, symbol, contractDetails.expiration || expiration);
    let previousCloseMeta = null;

    if (filters.includePrevious) {
      const quoteDate = option.quoteDate || getNewYorkDateParts(new Date()).key;
      const previousDate = getPreviousUsTradingDate(quoteDate);
      let previousOption = null;
      let previousError = null;

      if (previousDate) {
        try {
          const previousUrl = new URL(`https://api.marketdata.app/v1/options/quotes/${encodeURIComponent(contractSymbol)}/`);
          previousUrl.searchParams.set('date', previousDate);
          const previousResponse = await fetchWithTimeout(previousUrl.toString(), { headers }, 6_000);
          const previousJson = await previousResponse.json().catch(() => ({}));

          if (isMarketDataSuccess(previousResponse)) {
            previousOption = normalizeMarketDataOption(previousJson, 0, symbol, contractDetails.expiration || expiration);
          } else {
            previousError = previousJson.errmsg || getMarketDataErrorMessage(previousResponse, '上一交易日 EOD');
          }
        } catch (error) {
          previousError = error.message || 'MarketData.app 上一交易日 EOD 拉取失败。';
        }
      } else {
        previousError = '未能识别上一交易日，暂不能计算期权日收益。';
      }

      option = attachOptionDailyChange(option, previousOption, previousDate, previousError);
      previousCloseMeta = {
        previousCloseDate: option.previousCloseDate,
        previousCloseSource: option.previousCloseSource,
        dayChangeSource: option.dayChangeSource,
        dayChangeNote: option.dayChangeNote,
      };
    }

    const options = [option];
    return {
      expirations: contractDetails.expiration ? [contractDetails.expiration] : [],
      selectedExpiration: contractDetails.expiration || expiration || null,
      options,
      dataSource: {
        ...buildMarketDataSourceMeta(quoteResponse, options, 'single_contract'),
        ...(previousCloseMeta || {}),
      },
    };
  }

  const expirationsResult = await fetchMarketDataExpirations(symbol, headers).catch((error) => ({
    expirations: [],
    updated: null,
    error: error.message,
  }));
  const selectedExpiration = expiration || expirationsResult.expirations[0] || null;
  const chainUrl = new URL(`https://api.marketdata.app/v1/options/chain/${encodeURIComponent(symbol)}/`);
  if (selectedExpiration) chainUrl.searchParams.set('expiration', selectedExpiration);
  if (filters.strike) chainUrl.searchParams.set('strike', filters.strike);
  if (filters.side) chainUrl.searchParams.set('side', String(filters.side).toLowerCase());

  const chainResponse = await fetchWithTimeout(chainUrl.toString(), { headers }, 8_000);
  const chainJson = await chainResponse.json().catch(() => ({}));
  if (chainResponse.status === 404 || chainJson.s === 'no_data') {
    return {
      expirations: expiration ? [expiration] : [],
      selectedExpiration: expiration || null,
      options: [],
      message: chainJson.errmsg || 'MarketData.app 未返回期权链。',
    };
  }
  if (!isMarketDataSuccess(chainResponse)) {
    if (chainResponse.status === 401 || chainResponse.status === 403) {
      throw new Error('MarketData.app 期权链权限不足或 Token 不可用；免费层通常更适合单合约报价，完整期权链/实时 OPRA 需要对应套餐。');
    }
    throw new Error(getMarketDataErrorMessage(chainResponse, '期权链'));
  }

  const count = Array.isArray(chainJson.optionSymbol) ? chainJson.optionSymbol.length : 0;
  const options = Array.from({ length: count }, (_, index) => (
    normalizeMarketDataOption(chainJson, index, symbol, selectedExpiration)
  ));
  const chainExpirations = Array.from(new Set(options.map((item) => item.expiration).filter(Boolean))).sort();
  const expirations = expirationsResult.expirations.length ? expirationsResult.expirations : chainExpirations;

  return {
    expirations,
    selectedExpiration: selectedExpiration || expirations[0] || null,
    options,
    dataSource: {
      ...buildMarketDataSourceMeta(chainResponse, options, 'option_chain'),
      expirationsUpdatedAt: expirationsResult.updated || null,
      expirationsCount: expirations.length,
      expirationsError: expirationsResult.error || null,
    },
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
    throw new Error(`Tradier 到期日请求失败（HTTP ${expirationsResponse.status}），请检查 Token、账户权限和期权行情权限。`);
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
    throw new Error(`Tradier 期权链请求失败（HTTP ${chainResponse.status}），请检查 Token、账户权限和期权行情权限。`);
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
    throw new Error(`Yahoo Finance 期权接口请求失败（HTTP ${firstResponse.status}），公共接口可能被限制，请稍后重试或改用 MarketData.app/Tradier/Polygon。`);
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
      throw new Error(`Yahoo Finance 指定到期日期权链请求失败（HTTP ${chainResponse.status}），公共接口可能被限制。`);
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
    throw new Error(`Polygon 期权合约列表请求失败（HTTP ${contractsResponse.status}），请检查 API Key 和 Options 权限。`);
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
    throw new Error(`Polygon 期权快照请求失败（HTTP ${snapshotResponse.status}），请检查 API Key、套餐和 Options 权限。`);
  }
  const snapshotJson = await snapshotResponse.json();
  return {
    expirations,
    selectedExpiration,
    options: (snapshotJson.results || []).map(normalizePolygonOption),
  };
}

async function fetchLongbridge(symbol, expiration, credentials, filters = {}) {
  const contractSymbol = String(filters.contract || '').replace(/^OPTION_/i, '').trim().toUpperCase();
  if (!contractSymbol) {
    return {
      expirations: expiration ? [expiration] : [],
      selectedExpiration: expiration || null,
      options: [],
      message: '长桥当前仅用于单合约期权报价增强，请传入 OCC 合约代码。',
    };
  }

  const option = await fetchLongbridgeOptionQuote(contractSymbol, credentials);
  return {
    expirations: option?.expiration ? [option.expiration] : (expiration ? [expiration] : []),
    selectedExpiration: option?.expiration || expiration || null,
    options: option ? [option] : [],
    message: option ? null : '长桥未返回该期权合约报价，请确认 OPRA OpenAPI 权限。',
  };
}

const OPTION_PROVIDER_LABELS = {
  marketdata: 'MarketData.app',
  longbridge: 'Longbridge',
  tradier: 'Tradier',
  polygon: 'Polygon',
  yahoo: 'Yahoo Finance',
};

export function buildAutoOptionProviderPlan({
  marketDataToken = '',
  hasLongbridge = false,
  contract = '',
  tradierToken = '',
  polygonToken = '',
} = {}) {
  const plan = [];
  if (marketDataToken) plan.push('marketdata');
  if ((hasLongbridge || process.env.LONGBRIDGE_CLI_OPTION_FALLBACK !== '0') && contract) plan.push('longbridge');
  if (tradierToken) plan.push('tradier');
  if (polygonToken) plan.push('polygon');
  plan.push('yahoo');
  return Array.from(new Set(plan));
}

function shouldUseOptionPayload(payload, contract) {
  const options = Array.isArray(payload?.options) ? payload.options : [];
  if (contract) return options.length > 0;
  return options.length > 0 || (Array.isArray(payload?.expirations) && payload.expirations.length > 0);
}

function formatAttemptError(providerKey, errorOrMessage) {
  const label = OPTION_PROVIDER_LABELS[providerKey] || providerKey || '数据源';
  const message = typeof errorOrMessage === 'string'
    ? errorOrMessage
    : (errorOrMessage?.message || '未返回可用期权数据');
  return {
    provider: label,
    message,
  };
}

function formatAttemptSummary(attempt) {
  const provider = String(attempt?.provider || '').trim();
  const message = String(attempt?.message || '').trim();
  if (!provider) return message || '数据源未返回可用期权数据';
  if (!message) return provider;
  return message.startsWith(provider) ? message : `${provider} ${message}`;
}

function attachAutoFallbackMeta(payload, attempts = []) {
  if (!attempts.length) return payload;
  const fallbackNote = `自动路由已跳过 ${attempts.map((item) => item.provider).join('、')}，当前显示 ${payload.provider || '可用'} 数据。`;
  return {
    ...payload,
    dataSource: {
      ...(payload.dataSource || {}),
      autoFallback: true,
      fallbackAttempts: attempts,
      fallbackNote,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let cacheKey = '';
  let staleCached = null;

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbol = String(searchParams.get('symbol') || '').trim().toUpperCase();
    const expiration = searchParams.get('expiration') || null;
    const provider = searchParams.get('provider') || 'auto';
    const strike = searchParams.get('strike') || '';
    const side = searchParams.get('side') || '';
    const contract = searchParams.get('contract') || '';
    const includePrevious = ['1', 'true', 'yes'].includes(
      String(searchParams.get('includePrevious') || '').toLowerCase()
    );
    const marketDataToken = req.headers['x-marketdata-token']
      || req.headers['x-market-data-token']
      || process.env.MARKETDATA_TOKEN
      || process.env.MARKETDATA_API_TOKEN
      || '';
    const tradierToken = req.headers['x-tradier-token'] || process.env.TRADIER_TOKEN || '';
    const polygonToken = req.headers['x-polygon-token'] || process.env.POLYGON_API_KEY || '';
    const longbridgeCredentials = getLongbridgeCredentials(req.headers || {});

    if (!symbol) {
      return res.status(400).json({ error: '缺少 symbol 参数' });
    }

    cacheKey = [
      provider,
      symbol,
      expiration || 'front',
      strike || 'all-strikes',
      side || 'both',
      contract || 'chain',
      includePrevious ? 'with-previous' : 'current-only',
      marketDataToken ? `marketdata:${hashCredential(marketDataToken)}` : '',
      tradierToken ? `tradier:${hashCredential(tradierToken)}` : '',
      polygonToken ? `polygon:${hashCredential(polygonToken)}` : '',
      hasLongbridgeCredentials(longbridgeCredentials)
        ? `longbridge:${hashCredential(`${longbridgeCredentials.appKey}:${longbridgeCredentials.accessToken}`)}`
        : '',
    ].join(':');
    const cached = getCachedOptions(cacheKey, CACHE_TTL_MS);
    if (cached) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      res.setHeader('X-IB-Options-Cache', 'hit');
      return res.status(200).json(markOptionsCache(cached.payload, {
        status: 'hit',
        ageMs: Date.now() - cached.fetchedAt,
      }));
    }

    const fetchProviderPayload = async (providerKey) => {
      let result;
      if (providerKey === 'marketdata') {
        result = await fetchMarketDataApp(symbol, expiration, marketDataToken, { strike, side, contract, includePrevious });
      } else if (providerKey === 'longbridge') {
        result = await fetchLongbridge(symbol, expiration, longbridgeCredentials, { contract });
      } else if (providerKey === 'tradier') {
        result = await fetchTradier(symbol, expiration, tradierToken);
      } else if (providerKey === 'polygon') {
        result = await fetchPolygon(symbol, expiration, polygonToken);
      } else if (providerKey === 'yahoo') {
        result = await fetchYahooOptions(symbol, expiration);
      } else {
        result = {
          expirations: [],
          selectedExpiration: null,
          options: [],
          message: '期权链需要在设置中配置 MarketData.app、Tradier、Polygon 或 Longbridge API Token。',
        };
      }

      return filterOptionPayloadByContract({
        success: true,
        symbol,
        provider: OPTION_PROVIDER_LABELS[providerKey] || '未配置',
        generatedAt: new Date().toISOString(),
        ...result,
      }, contract);
    };

    staleCached = getCachedOptions(cacheKey, STALE_CACHE_TTL_MS);
    let pending = pendingOptionsRequests.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        let payload;
        if (provider === 'auto') {
          const autoPlan = buildAutoOptionProviderPlan({
            marketDataToken,
            hasLongbridge: hasLongbridgeCredentials(longbridgeCredentials),
            contract,
            tradierToken,
            polygonToken,
          });
          const attempts = [];
          let lastPayload = null;

          for (const providerKey of autoPlan) {
            try {
              const candidate = await fetchProviderPayload(providerKey);
              if (shouldUseOptionPayload(candidate, contract)) {
                payload = attachAutoFallbackMeta(candidate, attempts);
                break;
              }
              const reason = candidate.message || `${candidate.provider || OPTION_PROVIDER_LABELS[providerKey]} 未返回可用期权数据。`;
              attempts.push(formatAttemptError(providerKey, reason));
              lastPayload = attachAutoFallbackMeta(candidate, attempts);
            } catch (error) {
              attempts.push(formatAttemptError(providerKey, error));
            }
          }

          if (!payload) {
            payload = {
              ...(lastPayload || {
                success: true,
                symbol,
                provider: 'Auto',
                generatedAt: new Date().toISOString(),
                expirations: expiration ? [expiration] : [],
                selectedExpiration: expiration || null,
                options: [],
              }),
              message: `自动期权数据源暂不可用：${attempts.map(formatAttemptSummary).join('；') || '未配置可用数据源。'}`,
              dataSource: {
                ...(lastPayload?.dataSource || {}),
                autoFallback: true,
                fallbackAttempts: attempts,
                fallbackNote: '自动路由没有拿到可用期权数据。',
              },
            };
          }
        } else {
          payload = await fetchProviderPayload(provider);
        }

        optionsCache.set(cacheKey, { fetchedAt: Date.now(), payload });
        return payload;
      })().finally(() => {
        pendingOptionsRequests.delete(cacheKey);
      });
      pendingOptionsRequests.set(cacheKey, pending);
    }

    const payload = await pending;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.setHeader('X-IB-Options-Cache', 'miss');
    return res.status(200).json(markOptionsCache(payload, {
      status: staleCached ? 'refreshed-from-stale' : 'miss',
      ageMs: 0,
    }));
  } catch (error) {
    console.error('Options Chain Proxy Error:', error);
    if (staleCached) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      res.setHeader('X-IB-Options-Cache', 'stale');
      return res.status(200).json(markOptionsCache(staleCached.payload, {
        status: 'stale-error',
        ageMs: Date.now() - staleCached.fetchedAt,
        error: error.message,
      }));
    }
    return res.status(500).json({ error: error.message });
  }
}
