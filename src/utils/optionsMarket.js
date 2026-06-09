const OPTION_TYPES = new Set(['CALL', 'PUT']);
const BUY_DIRECTIONS = new Set(['BUY', 'BTO', '买入', '买']);
export const DEFAULT_OPTION_MULTIPLIER = 100;

export function normalizeOptionType(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'P' || text.includes('PUT') || text.includes('认沽')) return 'PUT';
  if (text === 'C' || text.includes('CALL') || text.includes('认购')) return 'CALL';
  return OPTION_TYPES.has(text) ? text : '';
}

export function normalizeUnderlying(value) {
  return String(value || '')
    .trim()
    .replace(/^(gb_|us|stock_|option_)/i, '')
    .toUpperCase();
}

export function normalizeStrike(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return String(number).replace(/\.0+$/, '');
}

export function normalizeExpiration(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const compact = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compact) return `20${compact[1]}-${compact[2]}-${compact[3]}`;

  const fullCompact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (fullCompact) return `${fullCompact[1]}-${fullCompact[2]}-${fullCompact[3]}`;

  const dashed = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) return text;

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return '';
}

export function formatCompactExpiration(value) {
  const expiration = normalizeExpiration(value);
  if (!expiration) return '';
  return expiration.replace(/^20/, '').replace(/-/g, '');
}

export function formatOptionTitle({ underlying, strike, optionType } = {}) {
  const normalizedUnderlying = normalizeUnderlying(underlying);
  const normalizedStrike = normalizeStrike(strike);
  const normalizedType = normalizeOptionType(optionType);
  if (!normalizedUnderlying) return '';
  if (!normalizedStrike || !normalizedType) return normalizedUnderlying;
  return `${normalizedUnderlying} ${normalizedStrike}${normalizedType === 'PUT' ? 'P' : 'C'}`;
}

export function buildOCCContractSymbol({ underlying, expiration, optionType, strike } = {}) {
  const normalizedUnderlying = normalizeUnderlying(underlying);
  const compactExpiration = formatCompactExpiration(expiration);
  const normalizedType = normalizeOptionType(optionType);
  const numericStrike = Number(strike);
  if (!normalizedUnderlying || !compactExpiration || !normalizedType || !Number.isFinite(numericStrike) || numericStrike <= 0) {
    return '';
  }
  const strikeCode = String(Math.round(numericStrike * 1000)).padStart(8, '0');
  return `${normalizedUnderlying}${compactExpiration}${normalizedType === 'PUT' ? 'P' : 'C'}${strikeCode}`;
}

export function buildOptionAssetId({ underlying, expiration, strike, optionType, contractSymbol } = {}) {
  const occ = buildOCCContractSymbol({ underlying, expiration, strike, optionType });
  if (occ) return `OPTION_${occ}`;
  const normalizedContract = String(contractSymbol || '').trim().toUpperCase();
  if (normalizedContract) return `OPTION_${normalizedContract.replace(/\s+/g, '_')}`;
  const normalizedUnderlying = normalizeUnderlying(underlying);
  const normalizedExpiration = normalizeExpiration(expiration);
  const normalizedStrike = normalizeStrike(strike);
  const normalizedType = normalizeOptionType(optionType);
  return `OPTION_${[normalizedUnderlying, normalizedExpiration, normalizedStrike, normalizedType].filter(Boolean).join('_')}`;
}

export function parseOptionContractSymbol(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return {};

  const yahooMatch = text.match(/^([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  if (yahooMatch) {
    const [, underlying, yymmdd, side, strikeRaw] = yahooMatch;
    const strike = Number(strikeRaw) / 1000;
    const expiration = normalizeExpiration(yymmdd);
    return {
      underlying,
      expiration,
      optionType: side === 'P' ? 'PUT' : 'CALL',
      strike: normalizeStrike(strike),
      contractSymbol: buildOCCContractSymbol({
        underlying,
        expiration,
        optionType: side === 'P' ? 'PUT' : 'CALL',
        strike,
      }) || text,
    };
  }

  const looseMatch = text.match(/^([A-Z.]+)\s+(\d{6}|\d{8}|\d{4}-\d{2}-\d{2})\s+(CALL|PUT|C|P)\s+([\d.]+)/);
  if (looseMatch) {
    const expiration = normalizeExpiration(looseMatch[2]);
    const optionType = normalizeOptionType(looseMatch[3]);
    const strike = normalizeStrike(looseMatch[4]);
    return {
      underlying: looseMatch[1],
      expiration,
      optionType,
      strike,
      contractSymbol: buildOCCContractSymbol({
        underlying: looseMatch[1],
        expiration,
        optionType,
        strike,
      }) || text,
    };
  }

  const strikeFirstLooseMatch = text.match(/^([A-Z.]+)\s+(\d{6}|\d{8}|\d{4}-\d{2}-\d{2})\s+([\d.]+)\s+(CALL|PUT|C|P)$/);
  if (strikeFirstLooseMatch) {
    const expiration = normalizeExpiration(strikeFirstLooseMatch[2]);
    const strike = normalizeStrike(strikeFirstLooseMatch[3]);
    const optionType = normalizeOptionType(strikeFirstLooseMatch[4]);
    return {
      underlying: strikeFirstLooseMatch[1],
      expiration,
      optionType,
      strike,
      contractSymbol: buildOCCContractSymbol({
        underlying: strikeFirstLooseMatch[1],
        expiration,
        optionType,
        strike,
      }) || text,
    };
  }

  const typeFirstMatch = text.match(/^([A-Z.]+)\s+(CALL|PUT|C|P)\s+(\d{6}|\d{8}|\d{4}-\d{2}-\d{2})\s+([\d.]+)/);
  if (typeFirstMatch) {
    const expiration = normalizeExpiration(typeFirstMatch[3]);
    const optionType = normalizeOptionType(typeFirstMatch[2]);
    const strike = normalizeStrike(typeFirstMatch[4]);
    return {
      underlying: typeFirstMatch[1],
      expiration,
      optionType,
      strike,
      contractSymbol: buildOCCContractSymbol({
        underlying: typeFirstMatch[1],
        expiration,
        optionType,
        strike,
      }) || text,
    };
  }

  return { contractSymbol: text };
}

export function normalizeOptionTrade(input = {}) {
  const parsed = parseOptionContractSymbol(input.contractSymbol || input.contract_symbol || input.asset_id || input.symbol);
  const underlying = normalizeUnderlying(
    input.underlying
      || input.underlying_symbol
      || parsed.underlying
      || input.asset_symbol
      || input.symbol
  );
  const optionType = normalizeOptionType(input.optionType || input.option_type || parsed.optionType);
  const strike = normalizeStrike(input.strike || input.strike_price || parsed.strike);
  const expiration = normalizeExpiration(input.expiration || input.expiry_date || input.expiration_date || parsed.expiration);
  const multiplier = Number(input.multiplier);
  const contractSymbol = buildOCCContractSymbol({ underlying, expiration, optionType, strike })
    || String(input.contractSymbol || input.contract_symbol || parsed.contractSymbol || '').trim().toUpperCase();

  if (!underlying || !optionType || !strike || !expiration) {
    return null;
  }

  return {
    underlying,
    expiration,
    expiry_date: expiration,
    optionType,
    option_type: optionType,
    strike,
    strike_price: Number(strike),
    contractSymbol,
    contract_symbol: contractSymbol,
    asset_id: buildOptionAssetId({ underlying, expiration, optionType, strike, contractSymbol }),
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : DEFAULT_OPTION_MULTIPLIER,
  };
}

export function normalizeOptionCandidate(input = {}, source = 'watchlist') {
  const normalized = normalizeOptionTrade(input);
  if (!normalized) return null;

  const { underlying, expiration, optionType, strike, contractSymbol } = normalized;

  return {
    id: contractSymbol || `${underlying}_${expiration}_${strike}_${optionType}`,
    symbol: contractSymbol || `${underlying} ${expiration} ${optionType} ${strike}`,
    name: input.name || input.asset_name || `${underlying} ${expiration.slice(5)} ${optionType} ${strike}`,
    underlying,
    expiration,
    optionType,
    strike,
    contractSymbol,
    source,
    tradeTime: input.trade_time || input.tradeTime || null,
  };
}

export function getOptionCandidates({ watchlist = [], trades = [], limit = 3 } = {}) {
  const watchOptions = watchlist
    .filter((item) => String(item.quoteType || item.typeDisp || '').toUpperCase() === 'OPTION')
    .map((item) => normalizeOptionCandidate(item, 'watchlist'))
    .filter(Boolean);

  const fallbackOptions = trades
    .filter((trade) => {
      const type = String(trade.asset_type || '').toUpperCase();
      const direction = String(trade.direction || '').toUpperCase();
      return type === 'OPTION' && BUY_DIRECTIONS.has(direction);
    })
    .map((trade) => normalizeOptionCandidate(trade, 'recent-buy'))
    .filter(Boolean);

  const source = watchOptions.length > 0 ? watchOptions : fallbackOptions;
  const seen = new Set();

  return source
    .filter((item) => {
      const key = item.contractSymbol || item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function mergeOptionQuote(candidate, option) {
  const price = Number(option?.mark ?? option?.last);
  const pctChange = Number(option?.percentChange);
  const absChange = Number(option?.change);

  return {
    ...candidate,
    quoteLabel: `${candidate.underlying} · ${candidate.expiration.slice(5)} · ${candidate.optionType}`,
    price: Number.isFinite(price) ? price : null,
    pctChange: Number.isFinite(pctChange) ? pctChange : null,
    absChange: Number.isFinite(absChange) ? absChange : null,
    provider: option?.provider || '',
    volume: option?.volume ?? null,
    openInterest: option?.openInterest ?? null,
  };
}

export function findMatchingOption(options = [], candidate) {
  return options.find((option) => {
    const sameContract = candidate.contractSymbol && option.contractSymbol === candidate.contractSymbol;
    const sameTerms = normalizeOptionType(option.type) === candidate.optionType
      && String(option.expiration || '') === candidate.expiration
      && normalizeStrike(option.strike) === candidate.strike;
    return sameContract || sameTerms;
  }) || null;
}
