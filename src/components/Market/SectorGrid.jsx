import React from 'react';
import './SectorGrid.css';

export default function SectorGrid({ items, colorConvention }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="sector-grid">
      {items.map((item, index) => {
        const isUpRaw = item.pctChange > 0;
        const isNeutral = item.pctChange === 0;
        
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

        return (
          <div className="sector-item" key={item.symbol || index}>
            <div className="sector-item__left">
              <span className="sector-item__icon">{item.icon || '📊'}</span>
              <span className="sector-item__name">{item.name}</span>
            </div>
            <div className={`sector-item__right ${colorClass}`}>
              <span className="sector-item__arrow">{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
              <span className="sector-item__pct">{pctFormatted}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
