import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchOutline, CloseOutline } from 'antd-mobile-icons';

export default function MarketHeader() {
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isSearching) {
      setQuery('');
      setResults([]);
    } else {
      // Focus input when search is activated
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isSearching]);

  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (query.trim().length < 1) {
        setResults([]);
        return;
      }
      
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (json && json.success && json.data) {
          setResults(json.data.filter(q => q.isYahooFinance));
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [query]);

  return (
    <>
      {isSearching ? (
        // Active search header
        <div className="flex items-center gap-3 pt-[calc(8px+var(--safe-area-top))] px-4 mb-4 w-full h-[52px]">
          <div className="flex-1 flex items-center gap-2 bg-white/10 rounded-full h-9 px-3 border border-white/5">
            <SearchOutline className="text-gray-400 text-base flex-shrink-0" />
            <input 
              ref={inputRef}
              type="text"
              className="flex-1 text-white text-sm bg-transparent outline-none h-full"
              placeholder="搜索股票代码/拼音/名称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <CloseOutline 
                className="text-gray-400 text-base cursor-pointer flex-shrink-0" 
                onClick={() => setQuery('')} 
              />
            )}
          </div>
          <button 
            onClick={() => setIsSearching(false)} 
            className="text-indigo-400 text-sm font-semibold whitespace-nowrap active:scale-95 transition-transform"
          >
            取消
          </button>
        </div>
      ) : (
        // Standard header
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
              onClick={() => setIsSearching(true)}
              className="w-8 h-8 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-300 active:scale-95 transition-transform"
            >
              <SearchOutline className="text-lg" />
            </button>
          </div>
        </div>
      )}

      {/* Search overlay & result list */}
      {isSearching && (
        <div className="fixed inset-x-0 bottom-0 top-[calc(52px+var(--safe-area-top))] bg-[#0B0E14]/98 z-50 overflow-y-auto px-4 pb-20">
          {query.trim().length === 0 ? (
            // Mask layer
            <div className="fixed inset-x-0 bottom-0 top-[calc(52px+var(--safe-area-top))] bg-black/60 -mx-4" />
          ) : (
            // Search Results Panel
            <div className="py-2">
              {loading && (
                <div className="py-8 text-center text-gray-400 text-sm">搜索中...</div>
              )}
              
              {!loading && results.length > 0 && (
                <div className="flex flex-col">
                  {results.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="flex justify-between items-center py-4 border-b border-white/5 active:bg-white/5 px-2 rounded-lg cursor-pointer"
                      onClick={() => {
                        setIsSearching(false);
                        navigate(`/stock/${item.symbol}`);
                      }}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-semibold text-white">{item.symbol}</span>
                        <span className="text-xs text-gray-400">{item.shortname || item.longname}</span>
                      </div>
                      <div className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                        {item.exchDisp}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {!loading && results.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">未找到匹配的股票</div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
