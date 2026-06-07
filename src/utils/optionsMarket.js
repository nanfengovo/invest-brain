const OPTION_TYPES = new Set(['CALL', 'PUT']);
const BUY_DIRECTIONS = new Set(['BUY', 'BTO', '买入', '买']);

export function normalizeOptionType(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text.includes('PUT') || text.includes('认沽')) return 'PUT';
  if (text.includes('CALL') || text.includes('认购')) return 'CALL';
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

export function parseOptionContractSymbol(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return {};

  const yahooMatch = text.match(/^([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  if (yahooMatch) {
    const [, underlying, yymmdd, side, strikeRaw] = yahooMatch;
    const year = Number(`20${yymmdd.slice(0, 2)}`);
    const month = yymmdd.slice(2, 4);
    const day = yymmdd.slice(4, 6);
    const strike = Number(strikeRaw) / 1000;
    return {
      underlying,
      expiration: `${year}-${month}-${day}`,
      optionType: side === 'P' ? 'PUT' : 'CALL',
      strike: normalizeStrike(strike),
      contractSymbol: text,
    };
  }

  const looseMatch = text.match(/^([A-Z.]+)\s+(\d{4}-\d{2}-\d{2})\s+(CALL|PUT)\s+([\d.]+)/);
  if (looseMatch) {
    return {
      underlying: looseMatch[1],
      expiration: looseMatch[2],
      optionType: looseMatch[3],
      strike: normalizeStrike(looseMatch[4]),
      contractSymbol: text,
    };
  }

  return { contractSymbol: text };
}

export function normalizeOptionCandidate(input = {}, source = 'watchlist') {
  const parsed = parseOptionContractSymbol(input.contractSymbol || input.contract_symbol || input.symbol);
  const underlying = normalizeUnderlying(
    input.underlying
      || input.underlying_symbol
      || parsed.underlying
      || input.asset_symbol
      || input.symbol
  );
  const optionType = normalizeOptionType(input.optionType || input.option_type || parsed.optionType);
  const strike = normalizeStrike(input.strike || input.strike_price || parsed.strike);
  const expiration = input.expiration || input.expiry_date || parsed.expiration || '';
  const contractSymbol = String(input.contractSymbol || input.contract_symbol || parsed.contractSymbol || '').trim().toUpperCase();

  if (!underlying || !optionType || !strike || !expiration) return null;

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
