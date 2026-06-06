import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SectorGrid({ items, colorConvention }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5 pb-6">
      {items.map((item, index) => {
        const isUpRaw = item.pctChange > 0;
        const isNeutral = item.pctChange === 0;
        
        let colorClass = 'text-gray-400';
        if (!isNeutral) {
          if (colorConvention === 'red-up-green-down') {
            colorClass = isUpRaw ? 'text-rose-500' : 'text-emerald-400';
          } else {
            colorClass = isUpRaw ? 'text-emerald-400' : 'text-rose-500';
          }
        }
        
        const sign = isUpRaw ? '+' : '';
        const pctFormatted = `${sign}${item.pctChange.toFixed(2)}%`;

        return (
          <div 
            className="flex justify-between items-center bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 active:scale-[0.98] transition-all cursor-pointer" 
            key={item.symbol || index}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-base flex-shrink-0 drop-shadow-sm">{item.icon || '📊'}</span>
              <span className="text-sm text-gray-300 font-medium truncate">{item.name}</span>
            </div>
            <div className={`flex items-center text-xs sm:text-sm font-mono flex-shrink-0 ${colorClass}`}>
              <span className="text-[10px] mr-0.5">{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
              <span>{pctFormatted}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
