import { getOptionDaysToExpiration } from './tradeLifecycle.js';
import { normalizeOptionType } from './optionsMarket.js';

export function parseOptionAlertInput(input, fallbackCondition = 'ABOVE') {
  const text = String(input || '').trim();
  if (!text) return null;

  let condition = String(fallbackCondition || 'ABOVE').toUpperCase() === 'BELOW' ? 'BELOW' : 'ABOVE';
  let priceText = text
    .replace(/，/g, ',')
    .replace(/[＄$]/g, '')
    .trim();

  const belowMatch = priceText.match(/^(?:<=|≤|<|低于|跌破|小于|below)\s*/i);
  const aboveMatch = priceText.match(/^(?:>=|≥|>|高于|超过|大于|above)\s*/i);
  if (belowMatch) {
    condition = 'BELOW';
    priceText = priceText.slice(belowMatch[0].length).trim();
  } else if (aboveMatch) {
    condition = 'ABOVE';
    priceText = priceText.slice(aboveMatch[0].length).trim();
  }

  const numberMatch = priceText.match(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?|[-+]?\.\d+/);
  if (!numberMatch) return null;

  const target = Number(numberMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(target) || target <= 0) return null;

  return {
    condition,
    target,
  };
}

export function getDteMonitor(expiration, now = new Date()) {
  const days = getOptionDaysToExpiration(expiration, now);
  if (days === null) {
    return {
      days,
      tone: 'unknown',
      label: 'DTE 未知',
      progress: 0,
      urgent: false,
    };
  }

  if (days < 0) {
    return {
      days,
      tone: 'expired',
      label: '已到期',
      progress: 100,
      urgent: false,
    };
  }

  if (days <= 5) {
    return {
      days,
      tone: 'endgame',
      label: days === 0 ? '0DTE 今日到期' : `末日区 ${days}DTE`,
      progress: 100,
      urgent: true,
    };
  }

  if (days < 14) {
    return {
      days,
      tone: 'warning',
      label: `${days}DTE Theta 加速`,
      progress: Math.max(58, Math.min(96, Math.round((14 - days) / 14 * 100))),
      urgent: false,
    };
  }

  if (days <= 30) {
    return {
      days,
      tone: 'safe',
      label: `${days}DTE 安全期`,
      progress: Math.max(18, Math.min(58, Math.round((30 - days) / 30 * 58))),
      urgent: false,
    };
  }

  return {
    days,
    tone: 'safe',
    label: `${days}DTE 安全期`,
    progress: 12,
    urgent: false,
  };
}

export function getMoneynessMonitor({
  underlyingPrice,
  strikePrice,
  optionType,
} = {}) {
  const price = Number(underlyingPrice);
  const strike = Number(strikePrice);
  const type = normalizeOptionType(optionType);

  if (!Number.isFinite(price) || !Number.isFinite(strike) || strike <= 0 || !type) {
    return {
      status: 'UNKNOWN',
      tone: 'unknown',
      label: '距离未知',
      distance: null,
      underlyingPrice: Number.isFinite(price) ? price : null,
    };
  }

  const distance = type === 'CALL' ? price - strike : strike - price;
  const isItm = distance >= 0;
  return {
    status: isItm ? 'ITM' : 'OTM',
    tone: isItm ? 'itm' : 'otm',
    label: `${isItm ? 'ITM 深度' : 'OTM 差距'} ${distance >= 0 ? '+' : '-'}$${Math.abs(distance).toFixed(2)}`,
    distance,
    underlyingPrice: price,
  };
}
