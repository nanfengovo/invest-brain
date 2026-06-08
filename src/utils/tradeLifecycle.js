import {
  DEFAULT_OPTION_MULTIPLIER,
  formatCompactExpiration,
  formatOptionTitle,
  normalizeExpiration,
  normalizeOptionTrade,
  normalizeOptionType as normalizeMarketOptionType,
  normalizeStrike,
  normalizeUnderlying,
} from './optionsMarket.js';

const BUY_DIRECTIONS = new Set(['BUY', 'OPEN', 'BTO', '买入', '买', '开仓']);
const SELL_DIRECTIONS = new Set(['SELL', 'CLOSE', 'STC', '卖出', '卖', '平仓']);

function normalizeOptionType(value) {
  return normalizeMarketOptionType(value);
}

function formatExpiryDate(value) {
  return formatCompactExpiration(value) || String(value || '').trim();
}

function formatStrikePrice(value) {
  return normalizeStrike(value) || String(value || '').trim();
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
  const normalized = normalizeOptionTrade(trade);
  if (normalized) {
    return {
      symbol: normalized.underlying,
      expiry: formatCompactExpiration(normalized.expiration),
      expiration: normalized.expiration,
      strike: normalized.strike,
      optionType: normalized.optionType,
      contractSymbol: normalized.contractSymbol,
      multiplier: normalized.multiplier,
    };
  }

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
  return normalizeUnderlying(trade.underlying_symbol || parsed.symbol || trade.symbol || '');
}

function isOptionTrade(trade = {}) {
  const parsed = getParsedOption(trade);
  return String(trade.asset_type || '').toUpperCase() === 'OPTION'
    || trade.expiry_date
    || trade.strike_price
    || trade.option_type
    || trade.contract_symbol
    || parsed.expiry
    || parsed.strike
    || parsed.optionType;
}

export function getTradeAssetDisplay(trade = {}) {
  const parsed = getParsedOption(trade);
  const isOption = isOptionTrade(trade);

  if (!isOption) return trade.asset_name || '';

  const expiry = formatExpiryDate(parsed.expiry || trade.expiry_date);
  const strike = formatStrikePrice(parsed.strike || trade.strike_price);
  const optionType = normalizeOptionType(parsed.optionType || trade.option_type)
    || (expiry && strike ? 'CALL' : '');

  return [expiry, strike, optionType].filter(Boolean).join(' ');
}

export function getTradeOptionDisplay(trade = {}) {
  const parsed = getParsedOption(trade);
  const underlying = normalizeUnderlying(trade.underlying_symbol || parsed.symbol || trade.symbol);
  const expiration = normalizeExpiration(parsed.expiration || parsed.expiry || trade.expiry_date);
  const strike = normalizeStrike(parsed.strike || trade.strike_price);
  const optionType = normalizeOptionType(parsed.optionType || trade.option_type);
  return {
    underlying,
    expiration,
    compactExpiration: formatCompactExpiration(expiration),
    strike,
    optionType,
    title: formatOptionTitle({ underlying, strike, optionType }),
    contractSymbol: parsed.contractSymbol || trade.contract_symbol || '',
  };
}

export function getOptionDaysToExpiration(expiration, now = new Date()) {
  const normalized = normalizeExpiration(expiration);
  if (!normalized) return null;
  const currentDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(currentDate.getTime())) return null;

  const [year, month, day] = normalized.split('-').map(Number);
  const expirationDate = new Date(year, month - 1, day);
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const diff = expirationDate.getTime() - today.getTime();
  return Math.round(diff / 86400000);
}

export function getOptionExpirationRisk(expiration, now = new Date()) {
  const days = getOptionDaysToExpiration(expiration, now);
  if (days === null) {
    return {
      days,
      tone: 'unknown',
      label: '期限未知',
      shortLabel: '未知',
    };
  }

  if (days < 0) {
    return {
      days,
      tone: 'expired',
      label: `已到期 ${Math.abs(days)} 天`,
      shortLabel: '已到期',
    };
  }

  if (days === 0) {
    return {
      days,
      tone: 'zero-dte',
      label: '0DTE 今日到期',
      shortLabel: '0DTE',
    };
  }

  if (days <= 3) {
    return {
      days,
      tone: 'endgame',
      label: `末日区 剩余 ${days} 天`,
      shortLabel: `${days}D`,
    };
  }

  if (days <= 7) {
    return {
      days,
      tone: 'hot',
      label: `短期期权 剩余 ${days} 天`,
      shortLabel: `${days}D`,
    };
  }

  if (days <= 14) {
    return {
      days,
      tone: 'warm',
      label: `剩余 ${days} 天`,
      shortLabel: `${days}D`,
    };
  }

  if (days <= 30) {
    return {
      days,
      tone: 'cool',
      label: `剩余 ${days} 天`,
      shortLabel: `${days}D`,
    };
  }

  return {
    days,
    tone: 'calm',
    label: `剩余 ${days} 天`,
    shortLabel: `${days}D`,
  };
}

export function getOptionExpirationLabel(trade = {}, now = new Date()) {
  const { expiration } = getTradeOptionDisplay(trade);
  if (!expiration) return '';
  const risk = getOptionExpirationRisk(expiration, now);
  return `EXP: ${expiration} · ${risk.label}`;
}

export function getTradeLifecycleKey(trade = {}) {
  const symbol = getTradeSymbolDisplay(trade);
  const assetDisplay = getTradeAssetDisplay(trade);
  const type = getTradeLifecycleType(trade);
  const broker = String(trade.broker || '').trim().toUpperCase();
  const account = String(trade.account || '').trim().toUpperCase();
  const author = String(trade.author || '未标记').trim().toUpperCase();
  const identity = type === 'OPTION'
    ? `${symbol}|${assetDisplay}`
    : `${symbol || trade.asset_id || ''}`;

  return [author, broker, account, type, identity].join('::');
}

function getTradeLifecycleType(trade = {}) {
  return isOptionTrade(trade) ? 'OPTION' : String(trade.asset_type || 'STOCK').toUpperCase();
}

export function getTradeQuantityUnit(trade = {}) {
  const type = getTradeLifecycleType(trade);
  if (type === 'OPTION') return '张';
  if (type === 'ETF') return '份';
  return '股';
}

export function getTradeMultiplier(trade = {}) {
  if (getTradeLifecycleType(trade) !== 'OPTION') return 1;
  const multiplier = Number(trade.multiplier || getParsedOption(trade).multiplier);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : DEFAULT_OPTION_MULTIPLIER;
}

export function getTradeDirectionKind(direction) {
  const value = String(direction || '').trim().toUpperCase();
  if (BUY_DIRECTIONS.has(value)) return 'BUY';
  if (SELL_DIRECTIONS.has(value)) return 'SELL';
  return 'OTHER';
}

export function shouldShowOptionExpirationLabel(trade = {}) {
  if (!isOptionTrade(trade)) return false;
  if (getTradeDirectionKind(trade.direction) !== 'BUY') return false;

  const lifecycle = trade.lifecycle;
  if (!lifecycle) return true;

  const ownOpenQty = Number(lifecycle.ownOpenQty);
  if (Number.isFinite(ownOpenQty)) return ownOpenQty > 0;

  return ['OPEN_ONLY', 'PARTIAL', 'EXPIRED_WORTHLESS'].includes(lifecycle.status)
    && Number(lifecycle.openQty || 0) > 0;
}

export function getTradeNotional(trade = {}) {
  const qty = Math.max(Number(trade.quantity) || 0, 0);
  const price = Number(trade.price) || 0;
  return qty * price * getTradeMultiplier(trade);
}

function getLifecycleStatus(stats) {
  if (!stats) return 'UNTRACKED';
  if (stats.buyQty <= 0 && stats.sellQty > 0) return 'ORPHAN_SELL';
  if (stats.buyQty <= 0) return 'UNTRACKED';
  if (stats.type === 'OPTION' && stats.openQty > 0 && stats.isExpired) return 'EXPIRED_WORTHLESS';
  if (stats.sellQty <= 0) return 'OPEN_ONLY';
  if (stats.openQty > 0) return 'PARTIAL';
  return 'CLOSED';
}

export function buildTradeLifecycleMap(trades = [], { now = new Date() } = {}) {
  const map = new Map();

  trades.forEach((trade) => {
    const key = getTradeLifecycleKey(trade);
    const directionKind = getTradeDirectionKind(trade.direction);
    const qty = Math.max(Number(trade.quantity) || 0, 0);
    const price = Number(trade.price) || 0;
    const fee = Math.max(Number(trade.fee) || 0, 0);

    if (!map.has(key)) {
      map.set(key, {
        key,
        type: getTradeLifecycleType(trade),
        unit: getTradeQuantityUnit(trade),
        multiplier: getTradeMultiplier(trade),
        expiration: getTradeOptionDisplay(trade).expiration || '',
        daysToExpiration: null,
        isExpired: false,
        expiredQty: 0,
        expiredCost: 0,
        closedReason: null,
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
    stats.type = stats.type || getTradeLifecycleType(trade);
    stats.unit = stats.unit || getTradeQuantityUnit(trade);
    stats.multiplier = Math.max(stats.multiplier, getTradeMultiplier(trade));
    stats.expiration = stats.expiration || getTradeOptionDisplay(trade).expiration || '';
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
    stats.daysToExpiration = stats.type === 'OPTION' ? getOptionDaysToExpiration(stats.expiration, now) : null;
    stats.isExpired = stats.type === 'OPTION' && stats.openQty > 0 && stats.daysToExpiration !== null && stats.daysToExpiration < 0;
    stats.expiredQty = stats.isExpired ? stats.openQty : 0;
    stats.expiredCost = stats.isExpired ? avgBuyCost * stats.expiredQty : 0;
    stats.realizedPnl = ((avgSellProceeds - avgBuyCost) * stats.closedQty) - stats.expiredCost;
    stats.status = getLifecycleStatus(stats);
    stats.closedReason = stats.status === 'EXPIRED_WORTHLESS'
      ? 'EXPIRED_WORTHLESS'
      : stats.status === 'CLOSED'
        ? 'CLOSED_TRADED'
        : null;
  });

  return map;
}

export function annotateTradesWithLifecycle(trades = [], options = {}) {
  const lifecycleMap = buildTradeLifecycleMap(trades, options);
  const remainingById = new Map();

  const groupedTrades = new Map();
  trades.forEach((trade) => {
    const key = getTradeLifecycleKey(trade);
    if (!groupedTrades.has(key)) groupedTrades.set(key, []);
    groupedTrades.get(key).push(trade);
  });

  groupedTrades.forEach((group) => {
    const buyLots = group
      .filter((trade) => getTradeDirectionKind(trade.direction) === 'BUY')
      .map((trade) => ({
        id: trade.id,
        remainingQty: Math.max(Number(trade.quantity) || 0, 0),
      }));

    group
      .filter((trade) => getTradeDirectionKind(trade.direction) === 'SELL')
      .forEach((trade) => {
        let sellQty = Math.max(Number(trade.quantity) || 0, 0);
        for (const lot of buyLots) {
          if (sellQty <= 0) break;
          const matchedQty = Math.min(lot.remainingQty, sellQty);
          lot.remainingQty -= matchedQty;
          sellQty -= matchedQty;
        }
      });

    buyLots.forEach((lot) => {
      remainingById.set(lot.id, lot.remainingQty);
    });
  });

  return trades.map((trade) => {
    const lifecycle = lifecycleMap.get(getTradeLifecycleKey(trade)) || null;
    const directionKind = getTradeDirectionKind(trade.direction);
    const ownOpenQty = directionKind === 'BUY'
      ? (remainingById.get(trade.id) ?? Math.max(Number(trade.quantity) || 0, 0))
      : 0;

    return {
      ...trade,
      option_display: isOptionTrade(trade) ? getTradeOptionDisplay(trade) : null,
      option_expiration_label: isOptionTrade(trade) ? getOptionExpirationLabel(trade, options.now || new Date()) : '',
      option_expiration_risk: isOptionTrade(trade) ? getOptionExpirationRisk(getTradeOptionDisplay(trade).expiration, options.now || new Date()) : null,
      lifecycle: lifecycle
        ? {
            ...lifecycle,
            ownOpenQty,
          }
        : null,
    };
  });
}

export function formatLifecyclePnl(value) {
  const number = Number(value) || 0;
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}$${Math.abs(number).toFixed(2)}`;
}

export function getOrphanSellLifecycleItems(trades = []) {
  const lifecycleMap = buildTradeLifecycleMap(trades);
  return Array.from(lifecycleMap.values()).filter((item) => item.status === 'ORPHAN_SELL');
}

export function buildTradePortfolioSummary(trades = []) {
  const lifecycleItems = Array.from(buildTradeLifecycleMap(trades).values());
  const summary = trades.reduce((current, trade) => {
    const directionKind = getTradeDirectionKind(trade.direction);
    const notional = getTradeNotional(trade);
    const fee = Math.max(Number(trade.fee) || 0, 0);

    if (directionKind === 'BUY') current.total_buys += notional;
    if (directionKind === 'SELL') current.total_sells += notional;
    current.total_fees += fee;
    current.total_trades += 1;
    if (trade.asset_id) current.assetIds.add(trade.asset_id);
    return current;
  }, {
    total_assets: 0,
    total_trades: 0,
    total_fees: 0,
    total_sells: 0,
    total_buys: 0,
    realized_pnl: lifecycleItems.reduce((total, item) => total + (Number(item.realizedPnl) || 0), 0),
    assetIds: new Set(),
  });

  summary.total_assets = summary.assetIds.size;
  delete summary.assetIds;
  return summary;
}
