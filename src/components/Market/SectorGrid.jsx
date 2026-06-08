import { useNavigate } from 'react-router-dom';

const getToneClass = (value, colorConvention) => {
  if (value === null || value === undefined || value === 0) return 'market-tone--flat';
  const redUp = colorConvention === 'red-up';
  const isUp = value > 0;
  return isUp
    ? (redUp ? 'market-tone--red' : 'market-tone--green')
    : (redUp ? 'market-tone--green' : 'market-tone--red');
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function SectorGrid({ items, colorConvention, refreshing = false }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div className={`market-sector-board market-live-board ${refreshing ? 'market-board--refreshing' : ''}`}>
      {items.map((item, index) => {
        const hasData = item.pctChange !== null && item.pctChange !== undefined;
        const isUpRaw = (item.pctChange || 0) > 0;
        const isNeutral = !hasData || item.pctChange === 0;
        const toneClass = getToneClass(item.pctChange, colorConvention);
        const sign = isUpRaw ? '+' : '';
        const pctFormatted = hasData ? `${sign}${item.pctChange.toFixed(2)}%` : '--';
        const flashClass = item.movement ? `market-flash--${item.movement}` : '';

        return (
          <button
            type="button"
            className={`market-sector-row market-live-row ${flashClass}`}
            key={`${item.symbol || 'sector'}-${index}`}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="market-sector-row__left">
              <span className={`market-sector-row__icon ${item.icon === 'AI' ? 'market-sector-row__icon--text' : ''}`}>
                {item.icon || '·'}
              </span>
              <span className="market-sector-row__name">{item.name}</span>
            </div>
            <div className="market-sector-row__quote">
              <span className="market-sector-row__price">{formatNumber(item.price)}</span>
              <span className={`market-sector-row__change ${toneClass}`}>
                <span>{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
                <span>{pctFormatted}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
