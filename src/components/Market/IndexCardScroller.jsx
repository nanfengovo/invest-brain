import React from 'react';
import { useNavigate } from 'react-router-dom';
import './IndexCardScroller.css';

// Simple SVG sparkline component
const Sparkline = ({ isUp }) => {
  const color = isUp ? 'var(--color-profit)' : 'var(--color-loss)';
  // If up, draw a line going generally up
  // If down, draw a line going generally down
  const pathData = isUp 
    ? "M 0 30 Q 10 25, 20 28 T 40 15 T 60 10 T 80 5" 
    : "M 0 5 Q 10 10, 20 8 T 40 20 T 60 25 T 80 30";
    
  return (
    <svg width="60" height="24" viewBox="0 0 80 35" className="sparkline">
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Optional gradient fill under the line could go here */}
    </svg>
  );
};

export default function IndexCardScroller({ items, colorConvention }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div className="index-card-scroller">
      {items.map((item, index) => {
        // Evaluate if the item is "up" based on raw percentage
        const isUpRaw = item.pctChange > 0;
        const isNeutral = item.pctChange === 0;
        
        // Determine the display color class based on user convention
        let colorClass = 'neutral';
        if (!isNeutral) {
          if (colorConvention === 'red-up-green-down') {
            colorClass = isUpRaw ? 'profit-red' : 'loss-green';
          } else {
            colorClass = isUpRaw ? 'profit-green' : 'loss-red';
          }
        }
        
        const sign = isUpRaw ? '+' : '';
        const pctFormatted = `${sign}${item.pctChange.toFixed(2)}%`;
        const absFormatted = `${sign}${item.absChange.toFixed(2)}`;

        return (
          <div 
            className="index-card" 
            key={item.symbol || index}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="index-card__header">
              <span className="index-card__name">{item.name}</span>
              <Sparkline isUp={isUpRaw} />
            </div>
            <div className={`index-card__price ${colorClass}`}>
              {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`index-card__changes ${colorClass}`}>
              <span className="index-card__pct">
                {isUpRaw ? '▲' : (isNeutral ? '' : '▼')} {pctFormatted}
              </span>
              <span className="index-card__abs">{absFormatted}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
