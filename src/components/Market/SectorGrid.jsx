import { useNavigate } from 'react-router-dom';

const getToneClass = (value, colorConvention) => {
  if (value === null || value === undefined || value === 0) return 'market-tone--flat';
  const redUp = colorConvention === 'red-up';
  const isUp = value > 0;
  return isUp
    ? (redUp ? 'market-tone--red' : 'market-tone--green')
    : (redUp ? 'market-tone--green' : 'market-tone--red');
};

export default function SectorGrid({ items, colorConvention }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div className="market-sector-board">
      {items.map((item, index) => {
        const hasData = item.pctChange !== null && item.pctChange !== undefined;
        const isUpRaw = (item.pctChange || 0) > 0;
        const isNeutral = !hasData || item.pctChange === 0;
        const toneClass = getToneClass(item.pctChange, colorConvention);
        const sign = isUpRaw ? '+' : '';
        const pctFormatted = hasData ? `${sign}${item.pctChange.toFixed(2)}%` : '--';

        return (
          <button
            type="button"
            className="market-sector-row"
            key={`${item.symbol || 'sector'}-${index}`}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="market-sector-row__left">
              <span className={`market-sector-row__icon ${item.icon === 'AI' ? 'market-sector-row__icon--text' : ''}`}>
                {item.icon || '·'}
              </span>
              <span className="market-sector-row__name">{item.name}</span>
            </div>
            <div className={`market-sector-row__change ${toneClass}`}>
              <span>{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
              <span>{pctFormatted}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
