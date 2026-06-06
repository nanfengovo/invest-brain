import React, { useState } from 'react';
import { SearchOutline } from 'antd-mobile-icons';
import SearchModal from '../common/SearchModal';

export default function MarketHeader() {
  const [searchVisible, setSearchVisible] = useState(false);

  return (
    <div className="flex justify-between items-start pt-[calc(8px+var(--safe-area-top))] px-4 mb-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center backdrop-blur-md border border-indigo-500/20">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">行情</h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-medium text-emerald-400">交易中</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-400/80 mt-0.5 ml-[42px]">全球主要指数实时监控</div>
      </div>
      
      <div className="flex items-center gap-4 mt-1">
        <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/5">
          <span className="opacity-40 grayscale text-sm">🇨🇳</span>
          <span className="text-base scale-110">🇺🇸</span>
          <span className="opacity-40 grayscale text-sm">🇭🇰</span>
        </div>
        <button 
          onClick={() => setSearchVisible(true)}
          className="w-8 h-8 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-300 active:scale-95 transition-transform"
        >
          <SearchOutline className="text-lg" />
        </button>
      </div>
      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />
    </div>
  );
}
