import React from 'react';
import { useNavigate } from 'react-router-dom';

const Sparkline = ({ isUp, colorClass }) => {
  const pathData = isUp 
    ? "M 0 30 Q 10 25, 20 28 T 40 15 T 60 10 T 80 5" 
    : "M 0 5 Q 10 10, 20 8 T 40 20 T 60 25 T 80 30";
    
  return (
    <svg width="60" height="24" viewBox="0 0 80 35" className="opacity-80">
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorClass}
      />
    </svg>
  );
};

export default function IndexCardScroller({ items, colorConvention }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div className="flex overflow-x-auto gap-4 px-4 pb-4 snap-x snap-mandatory hide-scrollbar">
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
        const absFormatted = `${sign}${item.absChange.toFixed(2)}`;

        return (
          <div 
            className="flex-shrink-0 w-36 snap-start bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col active:scale-95 transition-transform" 
            key={item.symbol || index}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-400 font-medium truncate pr-2">{item.name}</span>
              <Sparkline isUp={isUpRaw} colorClass={colorClass} />
            </div>
            
            <div className="text-2xl font-bold text-white tracking-tight mb-2">
              {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            
            <div className={`flex items-center gap-1.5 text-sm font-mono ${colorClass}`}>
              <div className={`flex items-center justify-center w-4 h-4 rounded-full bg-current/10`}>
                <span className="text-[10px]">{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
              </div>
              <span>{pctFormatted}</span>
            </div>
            <div className={`text-xs font-mono opacity-60 mt-0.5 ${colorClass}`}>
              {absFormatted}
            </div>
          </div>
        );
      })}
    </div>
  );
}
