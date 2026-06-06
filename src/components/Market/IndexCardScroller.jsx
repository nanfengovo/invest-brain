import { useNavigate } from 'react-router-dom';

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

const formatChange = (value) => {
  if (value === null || value === undefined) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const getDirectionIcon = (value) => {
  if (value === null || value === undefined || value === 0) return '';
  return value > 0 ? '▲' : '▼';
};

const Sparkline = ({ isUp, toneClass, id }) => {
  const pathData = isUp
    ? "M 0 30 Q 10 25, 20 28 T 40 15 T 60 10 T 80 5" 
    : "M 0 5 Q 10 10, 20 8 T 40 20 T 60 25 T 80 30";
    
  const areaData = `${pathData} L 80 35 L 0 35 Z`;
  const gradientId = `sparkline-grad-${id}`;

  return (
    <svg width="54" height="24" viewBox="0 0 80 35" className={`market-sparkline ${toneClass}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={areaData}
        fill={`url(#${gradientId})`}
      />
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default function IndexCardScroller({ items, colorConvention, variant = 'indices' }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div className={`market-index-strip market-index-strip--${variant}`}>
      {items.map((item, index) => {
        const hasData = item.price !== null && item.pctChange !== null;
        const isUpRaw = (item.pctChange || 0) > 0;
        const isNeutral = !hasData || item.pctChange === 0;
        const toneClass = getToneClass(item.pctChange, colorConvention);
        const extendedToneClass = getToneClass(item.extendedMarket?.pctChange, colorConvention);
        const sign = isUpRaw ? '+' : '';
        const pctFormatted = hasData ? formatChange(item.pctChange) : '--';
        const absFormatted = item.absChange !== null ? `${sign}${item.absChange.toFixed(2)}` : '--';
        const safeId = (item.symbol || `index-${index}`).replace(/[^a-zA-Z0-9]/g, '-');
        const flashClass = item.movement ? `market-flash--${item.movement}` : '';

        return (
          <button
            type="button"
            className={`market-index-card ${flashClass}`}
            key={item.symbol || index}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="market-index-card__top">
              <span className="market-index-card__name">{item.name}</span>
              <Sparkline isUp={isUpRaw} toneClass={toneClass} id={safeId} />
            </div>
            
            <div className="market-index-card__price">
              {formatNumber(item.price)}
            </div>
            
            <div className={`market-index-card__change ${toneClass}`}>
              <div className="market-index-card__change-main">
                <span>{isNeutral ? '' : getDirectionIcon(item.pctChange)}</span>
                <span>{pctFormatted}</span>
              </div>
              <span className="market-index-card__change-sub">{absFormatted}</span>
            </div>

            {item.extendedMarket && (
              <div className="market-index-card__extended">
                <span className="market-index-card__extended-label">{item.extendedMarket.label}</span>
                <span>{formatNumber(item.extendedMarket.price)}</span>
                <span className={extendedToneClass}>
                  {getDirectionIcon(item.extendedMarket.pctChange)} {formatChange(item.extendedMarket.pctChange)}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
