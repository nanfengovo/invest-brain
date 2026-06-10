import { parseDateTime } from '../../utils/time';
import {
  getOptionExpirationLabel,
  getOptionExpirationRisk,
  getTradeOptionDisplay,
  getTradeQuantityUnit,
} from '../../utils/tradeLifecycle';
import { getDteMonitor, getMoneynessMonitor } from '../../utils/optionMonitoring';
import { buildOptionHoldingMetrics } from '../../utils/optionPortfolio';
import './HoldingCard.css';

const TYPE_LABELS = {
  STOCK: '股票',
  OPTION: '期权',
  ETF: 'ETF',
  CRYPTO: '加密',
  FUND: '基金',
};

const formatCurrency = (num) => {
  const val = toFiniteNumberOrNull(num);
  if (val === null) return '--';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const formatSignedCurrency = (num) => {
  const value = Number(num);
  if (!Number.isFinite(value)) return '--';
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}$${formatCurrency(Math.abs(value))}`;
};

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = parseDateTime(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export default function HoldingCard({
  holding,
  underlyingPrice = null,
  marketQuote = null,
  optionQuote = null,
  liveMetrics = null,
  index = 0,
  viewMode = 'compact',
  isExpanded = false,
  selectedAuthor = '',
  expandedTrades = [],
  tradesLoading = false,
  onToggle,
  onAddOptionAlert,
}) {
  const assetType = String(holding.type || 'STOCK').toUpperCase();
  const isOption = assetType === 'OPTION';
  const optionMetrics = liveMetrics || buildOptionHoldingMetrics(holding, optionQuote);
  const quoteUnavailable = optionMetrics.quoteUnavailable;
  const optionDisplay = isOption ? getTradeOptionDisplay({
    asset_type: 'OPTION',
    symbol: holding.symbol,
    underlying_symbol: holding.underlying_symbol,
    strike_price: holding.strike_price,
    expiry_date: holding.expiry_date,
    option_type: holding.option_type,
    multiplier: holding.multiplier,
  }) : null;
  const optionExpirationLabel = isOption ? getOptionExpirationLabel({
    asset_type: 'OPTION',
    symbol: holding.symbol,
    underlying_symbol: holding.underlying_symbol,
    strike_price: holding.strike_price,
    expiry_date: holding.expiry_date,
    option_type: holding.option_type,
  }) : '';
  const optionExpirationRisk = isOption ? getOptionExpirationRisk(holding.expiry_date) : null;
  const dteMonitor = isOption ? getDteMonitor(holding.expiry_date) : null;
  const moneynessMonitor = isOption ? getMoneynessMonitor({
    underlyingPrice,
    strikePrice: holding.strike_price,
    optionType: holding.option_type,
  }) : null;
  const quantityUnit = getTradeQuantityUnit({ asset_type: holding.type });
  const {
    quantity,
    liveOptionPrice,
    hasLiveOptionPrice,
    positionValue,
    unrealizedPnl,
    unrealizedPnlPct,
    optionDayChangePct,
    optionPreviousClose,
    hasOptionDailyChange,
    optionDayChange,
    optionDayTone,
    optionDailyMissingReason,
    pnlTone,
  } = optionMetrics;
  const livePrice = toFiniteNumberOrNull(optionMetrics.livePrice ?? liveOptionPrice);
  const hasLivePrice = Boolean(optionMetrics.hasLivePrice ?? hasLiveOptionPrice);
  const dayPnl = toFiniteNumberOrNull(optionMetrics.dayPnl ?? optionDayChange);
  const dayPnlPct = toFiniteNumberOrNull(optionMetrics.dayPnlPct ?? optionDayChangePct);
  const nonOptionPnlPct = toFiniteNumberOrNull(optionMetrics.unrealizedPnlPct);
  const quoteProvider = optionMetrics.quoteProvider || marketQuote?.provider || marketQuote?.exchangeName || '';
  const title = isOption && optionDisplay?.title ? optionDisplay.title : holding.symbol;
  const typeLabel = TYPE_LABELS[assetType] || assetType;
  const hasMeta = Boolean(isOption ? optionExpirationLabel : (holding.name || holding.symbol));
  const shouldShowLivePnl = isOption || hasLivePrice || unrealizedPnl !== null;
  const pnlPercentText = isOption
    ? (Number.isFinite(unrealizedPnlPct) ? `${(unrealizedPnlPct * 100).toFixed(1)}%` : '--')
    : (nonOptionPnlPct !== null ? `${nonOptionPnlPct.toFixed(1)}%` : '--');

  return (
    <div
      className={`holding-card glass-card ${
        isExpanded ? 'holding-card--expanded' : ''
      } ${viewMode === 'compact' ? 'holding-card--compact' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className="holding-card__main"
        onClick={() => onToggle?.(holding.asset_id, holding.broker, holding.author)}
      >
        <div className="holding-card__left">
          <div className="holding-card__title-row">
            <span className="holding-card__symbol">{title}</span>
            <span className={`holding-card__type-badge holding-card__type-badge--${assetType.toLowerCase()}`}>
              {typeLabel}
            </span>
          </div>

          <div className={`holding-card__meta-row ${hasMeta ? '' : 'holding-card__meta-row--empty'}`}>
            {isOption ? (
              <span className={`holding-card__expiration holding-card__expiration--${optionExpirationRisk?.tone || 'unknown'}`}>
                {optionExpirationLabel}
              </span>
            ) : (
              <span className="holding-card__name">
                {holding.name || holding.symbol}
              </span>
            )}
          </div>

          <div className="holding-card__tag-row">
            {isOption && optionDisplay?.optionType && (
              <span className={`holding-card__option-badge holding-card__option-badge--${optionDisplay.optionType.toLowerCase()}`}>
                {optionDisplay.optionType}
              </span>
            )}
            {isOption && (
              <span className={`holding-card__moneyness holding-card__moneyness--${moneynessMonitor?.tone || 'unknown'}`}>
                {moneynessMonitor?.label || '距离未知'}
              </span>
            )}
            {holding.broker && (
              <span className="holding-card__broker-badge">
                🏦 {holding.broker}
              </span>
            )}
            {holding.author && !selectedAuthor && (
              <span className="holding-card__author-badge">
                {holding.author}
              </span>
            )}
            {holding.sector && (
              <span className="holding-card__sector-badge">
                {holding.sector}
              </span>
            )}
            {isOption && onAddOptionAlert && (
              <button
                type="button"
                className="holding-card__alert-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddOptionAlert(holding);
                }}
              >
                设提醒
              </button>
            )}
          </div>
        </div>

        <div className="holding-card__right">
          <div className="holding-card__position-value text-mono">
            ${formatCurrency(positionValue)}
          </div>
          {shouldShowLivePnl && (
            <div className={`holding-card__live-pnl holding-card__live-pnl--${pnlTone} text-mono`}>
              {quoteUnavailable
                ? '报价不可用'
                : hasLivePrice
                  ? `${formatSignedCurrency(unrealizedPnl)} · ${pnlPercentText}`
                  : isOption
                    ? '等待期权报价'
                    : '成本价估值'}
            </div>
          )}
          <div className="holding-card__quantity text-mono">
            {quantity.toLocaleString()} {quantityUnit}
          </div>
          <div className="holding-card__avg-cost text-mono">
            均价 ${formatCurrency(holding.avg_cost)}
          </div>
          {isOption && hasLiveOptionPrice && (
            <div className="holding-card__live-mark text-mono">
              Mark ${formatCurrency(liveOptionPrice)}
            </div>
          )}
          {!isOption && hasLivePrice && (
            <div className="holding-card__live-mark text-mono">
              现价 ${formatCurrency(livePrice)}
            </div>
          )}
        </div>
      </div>

      <div className="holding-card__footer">
        <span className="holding-card__trade-count">
          {holding.trade_count} 笔交易
        </span>
        <span className="holding-card__last-trade">
          最近 {formatDate(holding.last_trade)}
        </span>
        <span className={`holding-card__expand-icon ${isExpanded ? 'holding-card__expand-icon--open' : ''}`}>
          ▾
        </span>
      </div>

      {isOption && dteMonitor && (
        <div
          className={`holding-card__dte holding-card__dte--${dteMonitor.tone} ${dteMonitor.urgent ? 'holding-card__dte--urgent' : ''}`}
          aria-label={dteMonitor.label}
        >
          <div className="holding-card__dte-track">
            <span style={{ width: `${dteMonitor.progress}%` }} />
          </div>
          <div className="holding-card__dte-label">
            <span>Theta Clock</span>
            <strong>{dteMonitor.label}</strong>
          </div>
        </div>
      )}

      {isOption && optionQuote && (
        <div className={`holding-card__quote-panel ${quoteUnavailable ? 'holding-card__quote-panel--unavailable' : ''}`}>
          <div className="holding-card__quote-head">
            <span>{optionQuote.provider || '期权报价'}</span>
            <strong>
              {quoteUnavailable
                ? '报价不可用'
                : optionQuote.quoteDate
                ? `报价日 ${optionQuote.quoteDate}`
                : optionQuote.generatedAt
                  ? '刚刚更新'
                  : '等待刷新'}
            </strong>
          </div>
          {!quoteUnavailable && (
            <div className="holding-card__quote-strip">
              <span>Mark ${formatCurrency(liveOptionPrice)}</span>
              <span>Last ${formatCurrency(optionQuote.last)}</span>
              <span>Bid/Ask {formatCurrency(optionQuote.bid)} / {formatCurrency(optionQuote.ask)}</span>
              {optionPreviousClose !== null ? (
                <span>前收 ${formatCurrency(optionPreviousClose)}</span>
              ) : (
                <span className="holding-card__quote-chip--muted">前收缺失</span>
              )}
              <span className={`holding-card__quote-chip--${hasOptionDailyChange ? optionDayTone : 'muted'}`}>
                {hasOptionDailyChange
                  ? `今日 ${formatSignedCurrency(optionDayChange)} · ${optionDayChangePct !== null ? formatPercent(optionDayChangePct) : '--'}`
                  : '今日收益待基准'}
              </span>
            </div>
          )}
          {(quoteUnavailable || (!hasOptionDailyChange && optionDailyMissingReason)) && (
            <div className="holding-card__quote-note">
              {optionDailyMissingReason}
            </div>
          )}
        </div>
      )}

      {!isOption && marketQuote && hasLivePrice && (
        <div className="holding-card__quote-panel holding-card__quote-panel--stock">
          <div className="holding-card__quote-head">
            <span>{quoteProvider || '股票报价'}</span>
            <strong>{marketQuote.extendedMarket?.label || '实时/延迟行情'}</strong>
          </div>
          <div className="holding-card__quote-strip">
            <span>现价 ${formatCurrency(livePrice)}</span>
            <span className={`holding-card__quote-chip--${dayPnl > 0 ? 'profit' : dayPnl < 0 ? 'loss' : 'neutral'}`}>
              今日 {dayPnl !== null ? formatSignedCurrency(dayPnl) : '--'}
            </span>
            <span>涨跌幅 {dayPnlPct !== null ? formatPercent(dayPnlPct) : '--'}</span>
            <span>成本 ${formatCurrency(optionMetrics.costBasis)}</span>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="holding-card__trades-list">
          {tradesLoading ? (
            <div className="holding-card__trades-loading">加载中…</div>
          ) : expandedTrades.length > 0 ? (
            expandedTrades.map((trade) => {
              const isBuy = trade.direction === 'BUY' || trade.direction === 'OPEN';
              const tradeUnit = getTradeQuantityUnit({
                ...trade,
                asset_type: trade.asset_type || holding.type,
              });
              return (
                <div key={trade.id} className="holding-card__trade-item">
                  <div className="holding-card__trade-left">
                    <span className={`holding-card__trade-direction holding-card__trade-direction--${isBuy ? 'buy' : 'sell'}`}>
                      {isBuy ? '买入' : '卖出'}
                    </span>
                    <span className="holding-card__trade-date">
                      {formatDate(trade.trade_time)}
                    </span>
                  </div>
                  <div className="holding-card__trade-right">
                    <span className="holding-card__trade-qty text-mono">
                      {Number(trade.quantity).toLocaleString()} {tradeUnit} ×
                    </span>
                    <span className="holding-card__trade-price text-mono">
                      ${formatCurrency(trade.price)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="holding-card__trades-empty">暂无交易记录</div>
          )}
        </div>
      )}
    </div>
  );
}
