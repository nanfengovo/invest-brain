import { parseDateTime } from './time.js';
import { normalizeOptionTrade, normalizeUnderlying } from './optionsMarket.js';

function normalizeDirection(value = '') {
  const text = String(value || '').trim().toUpperCase();
  if (['SELL', 'CLOSE', 'STC', '卖出', '卖', '平仓'].includes(text)) return 'SELL';
  if (['BUY', 'OPEN', 'BTO', '买入', '买', '开仓'].includes(text)) return 'BUY';
  return text || 'UNKNOWN';
}

function normalizeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toFixed(6).replace(/\.?0+$/, '');
}

function normalizeAuthor(value = '') {
  return String(value || '未标记').trim().toUpperCase() || '未标记';
}

function normalizeTradeTime(value) {
  const date = parseDateTime(value);
  if (!date) return 'NO_TIME';
  return date.toISOString().slice(0, 19);
}

export function getTradeIdentityAssetKey(trade = {}) {
  const normalizedOption = normalizeOptionTrade(trade);
  if (normalizedOption?.asset_id) return normalizedOption.asset_id;

  const type = String(trade.asset_type || '').toUpperCase();
  const assetId = String(trade.asset_id || '').trim().toUpperCase();
  if (type === 'OPTION' || assetId.startsWith('OPTION_') || trade.option_type || trade.strike_price || trade.expiry_date) {
    return assetId || [
      'OPTION',
      normalizeUnderlying(trade.underlying_symbol || trade.symbol),
      trade.expiry_date || '',
      trade.strike_price || '',
      trade.option_type || '',
    ].filter(Boolean).join('_').toUpperCase();
  }

  return normalizeUnderlying(trade.symbol || trade.asset_id || trade.underlying_symbol);
}

export function buildTradeFingerprint(trade = {}, { author } = {}) {
  const tradeAuthor = normalizeAuthor(trade.author || author);
  return [
    tradeAuthor,
    getTradeIdentityAssetKey(trade),
    normalizeDirection(trade.direction),
    normalizeNumber(trade.quantity),
    normalizeNumber(trade.price),
    normalizeTradeTime(trade.trade_time),
  ].join('|');
}

export function createTradeDeduper(existingTrades = [], { author } = {}) {
  const seen = new Set(
    existingTrades
      .map((trade) => buildTradeFingerprint(trade, { author }))
      .filter(Boolean)
  );

  return {
    isDuplicate(trade) {
      const fingerprint = buildTradeFingerprint(trade, { author });
      if (seen.has(fingerprint)) return true;
      seen.add(fingerprint);
      return false;
    },
  };
}
