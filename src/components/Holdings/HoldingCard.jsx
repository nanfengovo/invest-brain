import { parseDateTime } from '../../utils/time';
import {
  getOptionExpirationLabel,
  getOptionExpirationRisk,
  getTradeOptionDisplay,
  getTradeQuantityUnit,
} from '../../utils/tradeLifecycle';
import { getDteMonitor, getMoneynessMonitor } from '../../utils/optionMonitoring';
import { buildOptionHoldingMetrics } from '../../utils/optionPortfolio';
import { getReadableAssetName } from '../../utils/displayText';
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

function getOptionExpirationParts(label) {
  return String(label || '')
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, index) => ({
      key: `${index}-${text}`,
      text,
      type: index === 0 && /^EXP:/i.test(text) ? 'date' : 'risk',
    }));
}

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

function getOptionQuoteStatusLabel(optionQuote, quoteUnavailable) {
  if (quoteUnavailable) return '报价不可用';
  const status = optionQuote?.quoteSource?.realTimeStatus;
  if (status === 'LIMITED_ENTITLEMENT') return '延迟/权限受限';
  if (status === 'ENTITLEMENT_DEPENDENT') return '实时取决于权限';
  if (optionQuote?.quoteSource?.autoFallback) return '自动路由';
  if (optionQuote?.quoteDate) return `报价日 ${optionQuote.quoteDate}`;
  if (optionQuote?.generatedAt) return '刚刚更新';
  return '等待刷新';
}

function getOptionQuoteAttempts(optionQuote) {
  const attempts = optionQuote?.quoteSource?.fallbackAttempts;
  return Array.isArray(attempts) ? attempts.filter((item) => item?.provider || item?.message) : [];
}

function compactQuoteMessage(message, maxLength = 78) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/OPRA|US Options Quotes|美股期权 OPRA|期权实时价需要/i.test(text)) {
    return '需要美股期权 OPRA OpenAPI 权限；App/PC 权限可能不同。';
  }
  if (/Longbridge|长桥|Python SDK/i.test(text)) {
    if (/未配置|补充服务|bridge|桥|线上函数|凭证/i.test(text)) {
      return '请配置长桥 Python SDK 桥，或在本机使用长桥 SDK 凭证。';
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }
  if (/Yahoo Finance|HTTP 401|公共接口|query2\.finance/i.test(text)) {
    return 'Yahoo 公共期权接口被限制，已继续尝试其他源。';
  }
  if (/MarketData\.app/i.test(text) && /Token|权限|额度|OPRA/i.test(text)) {
    return 'MarketData.app 需要可用 Token/套餐和 OPRA 授权。';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getOptionQuoteNote(optionQuote, optionDailyMissingReason) {
  const error = String(optionQuote?.error || '').trim();
  const dailyReason = String(optionDailyMissingReason || '').trim();
  const sourceNote = String(optionQuote?.quoteSource?.note || optionQuote?.quoteSource?.fallbackNote || '').trim();
  return [error, dailyReason, sourceNote]
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .join('；');
}

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
  const optionExpirationParts = isOption ? getOptionExpirationParts(optionExpirationLabel) : [];
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
  const optionQuoteStatusLabel = getOptionQuoteStatusLabel(optionQuote, quoteUnavailable);
  const optionQuoteAttempts = getOptionQuoteAttempts(optionQuote);
  const visibleOptionQuoteAttempts = quoteUnavailable ? optionQuoteAttempts.slice(0, 3) : optionQuoteAttempts.slice(0, 2);
  const hiddenOptionQuoteAttempts = Math.max(0, optionQuoteAttempts.length - visibleOptionQuoteAttempts.length);
  const optionQuoteNote = isOption ? compactQuoteMessage(getOptionQuoteNote(optionQuote, optionDailyMissingReason), 92) : '';
  const title = isOption && optionDisplay?.title ? optionDisplay.title : holding.symbol;
  const typeLabel = TYPE_LABELS[assetType] || assetType;
  const assetName = getReadableAssetName({
    symbol: holding.symbol,
    name: holding.name,
    fallback: holding.symbol,
  });
  const hasMeta = Boolean(isOption ? optionExpirationLabel : assetName);
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
        onClick={() => onToggle?.(holding.position_key || holding.asset_id, holding.broker, holding.author)}
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
              <span
                className={`holding-card__expiration holding-card__expiration--${optionExpirationRisk?.tone || 'unknown'}`}
                aria-label={optionExpirationLabel}
                title={optionExpirationLabel}
              >
                {optionExpirationParts.map((part) => (
                  <span
                    key={part.key}
                    className={`holding-card__expiration-part holding-card__expiration-part--${part.type}`}
                  >
                    {part.text}
                  </span>
                ))}
              </span>
            ) : (
              <span className="holding-card__name">
                {assetName}
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
              {optionQuoteStatusLabel}
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
          {(quoteUnavailable || optionQuoteNote) && (
            <div className="holding-card__quote-note">
              {optionQuoteNote || '该合约暂未返回可用 Mark/Last/Bid/Ask。'}
            </div>
          )}
          {optionQuoteAttempts.length > 0 && (
            <div className="holding-card__quote-attempts">
              <div className="holding-card__quote-attempts-summary">
                已尝试 {optionQuoteAttempts.length} 个数据源
              </div>
              {visibleOptionQuoteAttempts.map((attempt) => (
                <span key={`${attempt.provider || '数据源'}-${attempt.message || ''}`}>
                  <strong>{attempt.provider || '数据源'}</strong>
                  {compactQuoteMessage(attempt.message || '未返回可用报价', 56)}
                </span>
              ))}
              {hiddenOptionQuoteAttempts > 0 && (
                <em>另有 {hiddenOptionQuoteAttempts} 个数据源未返回可用报价</em>
              )}
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
