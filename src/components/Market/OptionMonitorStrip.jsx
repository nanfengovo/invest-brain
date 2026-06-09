import { useNavigate } from 'react-router-dom';
import { formatOptionTitle } from '../../utils/optionsMarket';
import { getDteMonitor, getMoneynessMonitor } from '../../utils/optionMonitoring';

const formatMoney = (value, digits = 2) => {
  const number = parseOptionalNumber(value);
  if (!Number.isFinite(number)) return '--';
  return `$${number.toFixed(digits)}`;
};

const formatNumber = (value) => {
  const number = parseOptionalNumber(value);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatExpiration = (value) => {
  const text = String(value || '');
  return text.match(/^\d{4}-\d{2}-\d{2}$/) ? text.slice(5) : text || '--';
};

const getQuoteStatus = (item, loading) => {
  if (loading) return '报价同步中';
  if (Number.isFinite(parseOptionalNumber(item.price))) return item.provider || '期权报价';
  return item.provider ? `${item.provider} 未返回匹配合约` : '期权报价未返回';
};

export default function OptionMonitorStrip({ items, loading = false, underlyingQuotes = {}, colorConvention }) {
  const navigate = useNavigate();
  if (!items?.length) return null;

  const redUp = colorConvention === 'red-up';

  return (
    <div className="market-option-strip">
      {items.map((item, index) => {
        const title = formatOptionTitle(item) || item.name || item.symbol;
        const underlyingQuote = underlyingQuotes[item.underlying] || {};
        const underlyingPrice = parseOptionalNumber(underlyingQuote.price ?? underlyingQuote.displayPrice);
        const dte = getDteMonitor(item.expiration);
        const money = getMoneynessMonitor({
          underlyingPrice,
          strikePrice: item.strike,
          optionType: item.optionType,
        });
        const isCall = item.optionType === 'CALL';
        const quotePrice = parseOptionalNumber(item.price);
        const quoteChange = parseOptionalNumber(item.pctChange);
        const quoteIsUp = Number.isFinite(quoteChange) && quoteChange > 0;
        const quoteToneClass = !Number.isFinite(quoteChange) || quoteChange === 0
          ? 'market-option-card__quote-change--flat'
          : quoteIsUp
            ? (redUp ? 'market-option-card__quote-change--red' : 'market-option-card__quote-change--green')
            : (redUp ? 'market-option-card__quote-change--green' : 'market-option-card__quote-change--red');

        return (
          <button
            type="button"
            key={item.id || item.contractSymbol || index}
            className={`market-option-card market-option-card--${String(dte.tone || 'unknown')}`}
            onClick={() => item.underlying && navigate(`/stock/${item.underlying}`)}
          >
            <div className="market-option-card__main">
              <div className="market-option-card__identity">
                <span className="market-option-card__title">{title}</span>
                <span className={`market-option-card__type market-option-card__type--${isCall ? 'call' : 'put'}`}>
                  {item.optionType}
                </span>
              </div>
              <div className="market-option-card__meta">
                <span>EXP {formatExpiration(item.expiration)}</span>
                <span>{dte.label}</span>
                <span>行权 {formatMoney(item.strike, 0)}</span>
              </div>
            </div>

            <div className="market-option-card__quote">
              <div className="market-option-card__quote-price">{formatMoney(quotePrice)}</div>
              <div className={`market-option-card__quote-change ${quoteToneClass}`}>
                {Number.isFinite(quoteChange) ? `${quoteChange > 0 ? '+' : ''}${quoteChange.toFixed(2)}%` : getQuoteStatus(item, loading)}
              </div>
            </div>

            <div className="market-option-card__risk">
              <span className={`market-option-card__moneyness market-option-card__moneyness--${money.tone}`}>
                {money.label}
              </span>
              <span className="market-option-card__underlying">
                {item.underlying} 股价 {formatNumber(underlyingPrice)}
              </span>
            </div>

            <div className="market-option-card__dte">
              <span style={{ width: `${dte.progress}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
