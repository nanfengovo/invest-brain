export function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildOptionRealtimeSummary(holdings = [], optionQuotes = {}) {
  const optionHoldings = holdings.filter((holding) => String(holding.type || '').toUpperCase() === 'OPTION');
  return optionHoldings.reduce((summary, holding) => {
    const holdingKey = `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`;
    const quote = optionQuotes[holdingKey];
    const quantity = Number(holding.total_quantity) || 0;
    const avgCost = Number(holding.avg_cost) || 0;
    const multiplier = Number(holding.multiplier) || 100;
    const costBasis = quantity * avgCost * multiplier;
    const mark = toFiniteNumberOrNull(quote?.mark ?? quote?.last ?? quote?.bid);
    const dayChangeUnit = toFiniteNumberOrNull(quote?.change);

    summary.count += 1;
    summary.contracts += quantity;
    summary.costBasis += costBasis;

    if (!quote) {
      summary.pending += 1;
      return summary;
    }

    const quoteUnavailable = Boolean(quote.quoteUnavailable || quote.error || mark === null);
    if (quoteUnavailable) {
      summary.unavailable += 1;
      return summary;
    }

    const positionValue = quantity * mark * multiplier;
    summary.quoted += 1;
    summary.marketValue += positionValue;
    summary.unrealizedPnl += positionValue - costBasis;

    if (dayChangeUnit !== null) {
      summary.dayPnl += dayChangeUnit * quantity * multiplier;
      summary.dayPnlQuoted += 1;
    } else {
      summary.dayPnlMissing += 1;
    }

    return summary;
  }, {
    count: 0,
    contracts: 0,
    quoted: 0,
    pending: 0,
    unavailable: 0,
    dayPnlQuoted: 0,
    dayPnlMissing: 0,
    costBasis: 0,
    marketValue: 0,
    unrealizedPnl: 0,
    dayPnl: 0,
  });
}

export function buildOptionHoldingMetrics(holding = {}, optionQuote = null) {
  const assetType = String(holding.type || holding.asset_type || 'STOCK').toUpperCase();
  const isOption = assetType === 'OPTION';
  const quantity = Number(holding.total_quantity ?? holding.quantity) || 0;
  const avgCost = Number(holding.avg_cost ?? holding.price) || 0;
  const multiplier = Number(holding.multiplier) || (isOption ? 100 : 1);
  const quoteUnavailable = isOption && Boolean(optionQuote?.quoteUnavailable || optionQuote?.error);
  const liveOptionPrice = isOption
    ? toFiniteNumberOrNull(optionQuote?.mark ?? optionQuote?.last ?? optionQuote?.bid)
    : null;
  const hasLiveOptionPrice = isOption && !quoteUnavailable && liveOptionPrice !== null && liveOptionPrice >= 0;
  const unitPrice = hasLiveOptionPrice ? liveOptionPrice : avgCost;
  const costBasis = quantity * avgCost * multiplier;
  const positionValue = quantity * unitPrice * multiplier;
  const unrealizedPnl = hasLiveOptionPrice ? positionValue - costBasis : null;
  const unrealizedPnlPct = hasLiveOptionPrice && costBasis > 0 ? unrealizedPnl / costBasis : null;
  const optionUnitDayChange = toFiniteNumberOrNull(optionQuote?.change);
  const optionDayChangePct = toFiniteNumberOrNull(optionQuote?.percentChange);
  const optionPreviousClose = toFiniteNumberOrNull(optionQuote?.previousClose);
  const hasOptionDailyChange = hasLiveOptionPrice && optionUnitDayChange !== null;
  const optionDayChange = hasOptionDailyChange
    ? optionUnitDayChange * quantity * multiplier
    : null;
  const optionDayTone = optionDayChange > 0 ? 'profit' : optionDayChange < 0 ? 'loss' : 'neutral';
  const optionDailyMissingReason = optionQuote?.error || optionQuote?.dayChangeNote
    || (optionQuote ? '报价源未返回上一交易日 EOD 基准，暂不能计算日收益。' : '');
  const pnlTone = unrealizedPnl > 0 ? 'profit' : unrealizedPnl < 0 ? 'loss' : 'neutral';

  return {
    isOption,
    quantity,
    avgCost,
    multiplier,
    quoteUnavailable,
    liveOptionPrice,
    hasLiveOptionPrice,
    unitPrice,
    costBasis,
    positionValue,
    unrealizedPnl,
    unrealizedPnlPct,
    optionUnitDayChange,
    optionDayChangePct,
    optionPreviousClose,
    hasOptionDailyChange,
    optionDayChange,
    optionDayTone,
    optionDailyMissingReason,
    pnlTone,
  };
}
