import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toast } from 'antd-mobile';
import {
  AddCircleOutline,
  CheckCircleOutline,
  SearchOutline,
  CloseOutline,
} from 'antd-mobile-icons';
import { getUsMarketStatus } from '../../utils/marketHours';

const SEARCHABLE_QUOTE_TYPES = new Set([
  'EQUITY',
  'ETF',
  'INDEX',
  'MUTUALFUND',
  'OPTION',
  'FUTURE',
  'CURRENCY',
  'CRYPTOCURRENCY',
]);

const normalizeSearchResults = (items = []) => {
  return items
    .filter((item) => {
      if (!item?.symbol) return false;
      if (item.isYahooFinance) return true;
      if (!item.quoteType) return true;
      return SEARCHABLE_QUOTE_TYPES.has(item.quoteType);
    })
    .slice(0, 12);
};

function padMarketTime(ny) {
  return `${String(ny.hour).padStart(2, '0')}:${String(ny.minute).padStart(2, '0')}`;
}

export default function MarketHeader({ watchlist = [], onAddWatchItem }) {
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [marketStatus, setMarketStatus] = useState(() => getUsMarketStatus());
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const watchedSymbols = new Set(watchlist.map((item) => String(item.symbol || '').toUpperCase()));

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
          setResults(normalizeSearchResults(json.data));
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [query]);

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getUsMarketStatus());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  const handleAddWatchItem = (event, item) => {
    event.stopPropagation();
    if (!onAddWatchItem) return;

    const added = onAddWatchItem(item);
    Toast.show({ content: added ? '已添加到我的关注' : '已在我的关注中' });
  };

  return (
    <>
      {isSearching ? (
        <div className="market-search-overlay">
          <div className="market-search-bar">
            <div className="market-search-bar__field">
              <SearchOutline className="market-search-bar__icon" />
              <input 
                ref={inputRef}
                type="text"
                className="market-search-bar__input"
                placeholder="搜索股票代码/拼音/名称"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <CloseOutline 
                  className="market-search-bar__clear" 
                  onClick={() => setQuery('')} 
                />
              )}
            </div>
            <button 
              type="button"
              onClick={() => setIsSearching(false)} 
              className="market-search-bar__cancel"
            >
              取消
            </button>
          </div>

          <div className="market-search-panel">
            {query.trim().length === 0 ? (
              <div className="market-search-panel__empty-surface" />
            ) : (
              <div className="market-search-results">
                {loading && (
                  <div className="market-search-results__empty">搜索中...</div>
                )}
                
                {!loading && results.length > 0 && (
                  <div className="market-search-results__list">
                    {results.map((item, idx) => {
                      const isWatched = watchedSymbols.has(item.symbol);

                      return (
                        <div
                          key={`${item.symbol}-${idx}`}
                          className={`market-search-result ${isWatched ? 'market-search-result--watched' : ''}`}
                          onClick={() => {
                            setIsSearching(false);
                            navigate(`/stock/${item.symbol}`);
                          }}
                        >
                          <div className="market-search-result__main">
                            <span className="market-search-result__symbol">{item.symbol}</span>
                            <span className="market-search-result__name">{item.shortname || item.longname}</span>
                          </div>
                          <div className="market-search-result__side">
                            <div className="market-search-result__exchange">
                              {item.exchDisp || item.typeDisp || item.quoteType}
                            </div>
                            <button
                              type="button"
                              className="market-search-result__add"
                              aria-label={`${isWatched ? '已关注' : '添加关注'} ${item.symbol}`}
                              disabled={isWatched}
                              onClick={(event) => handleAddWatchItem(event, item)}
                            >
                              {isWatched ? <CheckCircleOutline /> : <AddCircleOutline />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {!loading && results.length === 0 && (
                  <div className="market-search-results__empty">未找到匹配的股票</div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <header className="market-header">
          <div className="market-header__left">
            <div className="market-header__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
            </div>
            <div className="market-header__copy">
              <div className="market-header__title-row">
                <h1>行情</h1>
                <span
                  className={`market-status-pill market-status-pill--${marketStatus.phase}`}
                  title={`${marketStatus.detail} · 纽约时间 ${marketStatus.ny.key} ${padMarketTime(marketStatus.ny)}`}
                >
                  <span className="market-status-pill__dot" aria-hidden="true" />
                  {marketStatus.label}
                </span>
              </div>
              <p>{watchlist.length > 0 ? '关注股票实时监控' : '全球主要指数实时监控'}</p>
            </div>
          </div>
          
          <div className="market-header__actions">
            <div className="market-region-switch" aria-label="市场地区">
              <span className="market-region-switch__item">🇨🇳</span>
              <span className="market-region-switch__item market-region-switch__item--active">🇺🇸</span>
              <span className="market-region-switch__item">🇭🇰</span>
            </div>
            <button 
              type="button"
              onClick={() => setIsSearching(true)}
              className="market-search-button"
              aria-label="搜索股票"
            >
              <SearchOutline />
            </button>
          </div>
        </header>
      )}
    </>
  );
}
