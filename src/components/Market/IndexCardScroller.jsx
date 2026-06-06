import React from 'react';
import { useNavigate } from 'react-router-dom';

const Sparkline = ({ isUp, colorClass, id }) => {
  const pathData = isUp 
    ? "M 0 30 Q 10 25, 20 28 T 40 15 T 60 10 T 80 5" 
    : "M 0 5 Q 10 10, 20 8 T 40 20 T 60 25 T 80 30";
    
  const areaData = `${pathData} L 80 35 L 0 35 Z`;
  const gradientId = `sparkline-grad-${id}`;

  return (
    <svg width="42" height="16" viewBox="0 0 80 35" className="opacity-70 overflow-visible flex-shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={areaData}
        fill={`url(#${gradientId})`}
        className={colorClass}
      />
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
    <div className="grid grid-cols-3 gap-2.5 w-full">
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
        
        // Clean unique ID for gradient stopping duplicate bugs
        const safeId = (item.symbol || `index-${index}`).replace(/[^a-zA-Z0-9]/g, '-');

        return (
          <div 
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-2.5 flex flex-col justify-between active:scale-[0.98] transition-all cursor-pointer" 
            key={item.symbol || index}
            onClick={() => item.symbol && navigate(`/stock/${item.symbol}`)}
          >
            <div className="flex justify-between items-start w-full">
              <span className="text-[11px] text-gray-400 font-medium truncate pr-1 flex-1">{item.name}</span>
              <Sparkline isUp={isUpRaw} colorClass={colorClass} id={safeId} />
            </div>
            
            <div className="text-sm sm:text-base font-bold text-white font-mono tracking-tight mt-2 overflow-hidden text-ellipsis whitespace-nowrap">
              {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            
            <div className={`flex flex-col mt-1 font-mono text-[10px] sm:text-[11px] font-semibold leading-tight ${colorClass}`}>
              <div className="flex items-center gap-0.5">
                <span>{isUpRaw ? '▲' : (isNeutral ? '' : '▼')}</span>
                <span>{pctFormatted}</span>
              </div>
              <div className="opacity-60 text-[9px] sm:text-[10px] pl-2">
                {absFormatted}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
