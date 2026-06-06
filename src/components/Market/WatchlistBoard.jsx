import { useNavigate } from 'react-router-dom';
import { DeleteOutline } from 'antd-mobile-icons';

const formatNumber = (value) => {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getToneClass = (value, colorConvention) => {
  if (value === null || value === undefined || value === 0) return 'market-tone--flat';
  const redUp = colorConvention === 'red-up';
  const isUp = value > 0;
  return isUp
    ? (redUp ? 'market-tone--red' : 'market-tone--green')
    : (redUp ? 'market-tone--green' : 'market-tone--red');
};

const getTypeLabel = (item) => {
  const type = item.quoteType || item.typeDisp;
  if (type === 'OPTION') return '期权';
  if (type === 'EQUITY') return '股票';
  if (type === 'ETF') return 'ETF';
  if (type === 'INDEX') return '指数';
  if (type === 'FUTURE') return '期货';
  if (type === 'CRYPTOCURRENCY') return '加密';
  return item.typeDisp || item.quoteType || '标的';
};

export default function WatchlistBoard({ items, colorConvention, onRemove }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) {
    return (
      <div className="market-watchlist-empty">
        <div className="market-watchlist-empty__title">暂无关注</div>
        <p>搜索股票或期权后，点加号添加到这里。</p>
      </div>
    );
  }

  return (
    <div className="market-watchlist-board">
      {items.map((item) => {
        const hasPrice = item.price !== null && item.price !== undefined;
        const isUpRaw = (item.pctChange || 0) > 0;
        const isNeutral = item.pctChange === null || item.pctChange === undefined || item.pctChange === 0;
        const toneClass = getToneClass(item.pctChange, colorConvention);
        const sign = isUpRaw ? '+' : '';
        const pctFormatted = item.pctChange !== null && item.pctChange !== undefined
          ? `${sign}${item.pctChange.toFixed(2)}%`
          : '--';

        return (
          <div
            className="market-watchlist-row"
            key={item.symbol}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/stock/${item.symbol}`)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              navigate(`/stock/${item.symbol}`);
            }}
          >
            <div className="market-watchlist-row__main">
              <div className="market-watchlist-row__symbol-line">
                <span className="market-watchlist-row__symbol">{item.symbol}</span>
                <span className="market-watchlist-row__type">{getTypeLabel(item)}</span>
              </div>
              <div className="market-watchlist-row__name">
                {item.name || item.exchange || item.symbol}
              </div>
            </div>

            <div className="market-watchlist-row__quote">
              <div className="market-watchlist-row__price">
                {formatNumber(hasPrice ? item.price : null)}
              </div>
              <div className={`market-watchlist-row__change ${toneClass}`}>
                <span>{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
                <span>{pctFormatted}</span>
              </div>
            </div>

            <button
              type="button"
              className="market-watchlist-row__remove"
              aria-label={`移除关注 ${item.symbol}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(item.symbol);
              }}
            >
              <DeleteOutline />
            </button>
          </div>
        );
      })}
    </div>
  );
}
