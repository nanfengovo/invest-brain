const BUY_DIRECTIONS = new Set(['BUY', 'OPEN', 'BTO', '买入', '买', '开仓']);
const SELL_DIRECTIONS = new Set(['SELL', 'CLOSE', 'STC', '卖出', '卖', '平仓']);
const OPTION_CONTRACT_MULTIPLIER = 100;

function normalizeOptionType(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'C' || text.includes('CALL') || text.includes('认购')) return 'CALL';
  if (text === 'P' || text.includes('PUT') || text.includes('认沽')) return 'PUT';
  return '';
}

function formatExpiryDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const compactMatch = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) return text;

  const fullCompactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (fullCompactMatch) {
    return `${fullCompactMatch[1].slice(2)}${fullCompactMatch[2]}${fullCompactMatch[3]}`;
  }

  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return `${dateMatch[1].slice(2)}${dateMatch[2]}${dateMatch[3]}`;
  }

  return text;
}

function formatStrikePrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value || '').trim();
  return String(number).replace(/\.0+$/, '');
}

function parseOptionLabel(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return {};
  const monthMap = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  };

  const idMatch = text.match(/^([A-Z.]+)_(\d{6}|\d{4}-\d{2}-\d{2})_([\d.]+)_(CALL|PUT|C|P)$/);
  if (idMatch) {
    return {
      symbol: idMatch[1],
      expiry: formatExpiryDate(idMatch[2]),
      strike: formatStrikePrice(idMatch[3]),
      optionType: normalizeOptionType(idMatch[4]),
    };
  }

  const yahooMatch = text.match(/^([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  if (yahooMatch) {
    return {
      symbol: yahooMatch[1],
      expiry: yahooMatch[2],
      optionType: normalizeOptionType(yahooMatch[3]),
      strike: formatStrikePrice(Number(yahooMatch[4]) / 1000),
    };
  }

  const looseMatch = text.match(
    /^([A-Z.]+)\s+(\d{6}|\d{8}|\d{4}-\d{2}-\d{2})\s+(?:(CALL|PUT|C|P)\s+)?([\d.]+)(?:\s+(CALL|PUT|C|P))?$/
  );
  if (looseMatch) {
    return {
      symbol: looseMatch[1],
      expiry: formatExpiryDate(looseMatch[2]),
      optionType: normalizeOptionType(looseMatch[3] || looseMatch[5]),
      strike: formatStrikePrice(looseMatch[4]),
    };
  }

  const typeFirstMatch = text.match(
    /^([A-Z.]+)\s+(CALL|PUT|C|P)\s+(\d{6}|\d{8}|\d{4}-\d{2}-\d{2})\s+([\d.]+)$/
  );
  if (typeFirstMatch) {
    return {
      symbol: typeFirstMatch[1],
      optionType: normalizeOptionType(typeFirstMatch[2]),
      expiry: formatExpiryDate(typeFirstMatch[3]),
      strike: formatStrikePrice(typeFirstMatch[4]),
    };
  }

  const monthMatch = text.match(
    /^([A-Z.]+)\s+([A-Z]{3})\s+(\d{1,2})\s+'?(\d{2})\s+([\d.]+)(?:\s+(CALL|PUT|C|P))?/
  );
  if (monthMatch && monthMap[monthMatch[2]]) {
    return {
      symbol: monthMatch[1],
      expiry: `${monthMatch[4]}${monthMap[monthMatch[2]]}${monthMatch[3].padStart(2, '0')}`,
      strike: formatStrikePrice(monthMatch[5]),
      optionType: normalizeOptionType(monthMatch[6]),
    };
  }

  return {};
}

export function getParsedOption(trade = {}) {
  const candidates = [
    trade.contract_symbol,
    trade.asset_id,
    trade.asset_name,
    trade.note,
    trade.symbol,
  ];

  for (const candidate of candidates) {
    const parsed = parseOptionLabel(candidate);
    if (parsed.symbol || parsed.expiry || parsed.strike || parsed.optionType) {
      return parsed;
    }
  }

  return {};
}

export function getTradeSymbolDisplay(trade = {}) {
  const parsed = getParsedOption(trade);
  return (trade.underlying_symbol || parsed.symbol || trade.symbol || '').toUpperCase();
}

export function getTradeAssetDisplay(trade = {}) {
  const parsed = getParsedOption(trade);
  const isOption = String(trade.asset_type || '').toUpperCase() === 'OPTION'
    || trade.expiry_date
    || trade.strike_price
    || trade.option_type
    || trade.contract_symbol
    || parsed.expiry
    || parsed.strike
    || parsed.optionType;

  if (!isOption) return trade.asset_name || '';

  const expiry = formatExpiryDate(parsed.expiry || trade.expiry_date);
  const strike = formatStrikePrice(parsed.strike || trade.strike_price);
  const optionType = normalizeOptionType(parsed.optionType || trade.option_type)
    || (expiry && strike ? 'CALL' : '');

  return [expiry, strike, optionType].filter(Boolean).join(' ');
}

export function getTradeLifecycleKey(trade = {}) {
  const symbol = getTradeSymbolDisplay(trade);
  const assetDisplay = getTradeAssetDisplay(trade);
  const type = assetDisplay ? 'OPTION' : String(trade.asset_type || 'STOCK').toUpperCase();
  const broker = String(trade.broker || '').trim().toUpperCase();
  const account = String(trade.account || '').trim().toUpperCase();
  const identity = type === 'OPTION'
    ? `${symbol}|${assetDisplay}`
    : `${symbol || trade.asset_id || ''}`;

  return [broker, account, type, identity].join('::');
}

function getTradeLifecycleType(trade = {}) {
  return getTradeAssetDisplay(trade) ? 'OPTION' : String(trade.asset_type || 'STOCK').toUpperCase();
}

function getTradeMultiplier(trade = {}) {
  return getTradeLifecycleType(trade) === 'OPTION' ? OPTION_CONTRACT_MULTIPLIER : 1;
}

function getDirectionKind(direction) {
  const value = String(direction || '').trim().toUpperCase();
  if (BUY_DIRECTIONS.has(value)) return 'BUY';
  if (SELL_DIRECTIONS.has(value)) return 'SELL';
  return 'OTHER';
}

function getLifecycleStatus(stats) {
  if (!stats || stats.buyQty <= 0) return 'UNTRACKED';
  if (stats.sellQty <= 0) return 'OPEN_ONLY';
  if (stats.openQty > 0) return 'PARTIAL';
  return 'CLOSED';
}

export function buildTradeLifecycleMap(trades = []) {
  const map = new Map();

  trades.forEach((trade) => {
    const key = getTradeLifecycleKey(trade);
    const directionKind = getDirectionKind(trade.direction);
    const qty = Math.max(Number(trade.quantity) || 0, 0);
    const price = Number(trade.price) || 0;
    const fee = Math.max(Number(trade.fee) || 0, 0);

    if (!map.has(key)) {
      map.set(key, {
        key,
        multiplier: getTradeMultiplier(trade),
        buyQty: 0,
        sellQty: 0,
        buyValue: 0,
        sellValue: 0,
        buyFees: 0,
        sellFees: 0,
        openQty: 0,
        closedQty: 0,
        realizedPnl: 0,
        status: 'UNTRACKED',
      });
    }

    const stats = map.get(key);
    stats.multiplier = Math.max(stats.multiplier, getTradeMultiplier(trade));
    if (directionKind === 'BUY') {
      stats.buyQty += qty;
      stats.buyValue += price * qty * stats.multiplier;
      stats.buyFees += fee;
    } else if (directionKind === 'SELL') {
      stats.sellQty += qty;
      stats.sellValue += price * qty * stats.multiplier;
      stats.sellFees += fee;
    }
  });

  map.forEach((stats) => {
    stats.openQty = Math.max(stats.buyQty - stats.sellQty, 0);
    stats.closedQty = Math.min(stats.buyQty, stats.sellQty);
    const avgBuyCost = stats.buyQty > 0 ? (stats.buyValue + stats.buyFees) / stats.buyQty : 0;
    const avgSellProceeds = stats.sellQty > 0 ? (stats.sellValue - stats.sellFees) / stats.sellQty : 0;
    stats.realizedPnl = (avgSellProceeds - avgBuyCost) * stats.closedQty;
    stats.status = getLifecycleStatus(stats);
  });

  return map;
}

export function annotateTradesWithLifecycle(trades = []) {
  const lifecycleMap = buildTradeLifecycleMap(trades);
  return trades.map((trade) => ({
    ...trade,
    lifecycle: lifecycleMap.get(getTradeLifecycleKey(trade)) || null,
  }));
}

export function formatLifecyclePnl(value) {
  const number = Number(value) || 0;
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}$${Math.abs(number).toFixed(2)}`;
}
