import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchOutline, CloseOutline } from 'antd-mobile-icons';
import './SearchModal.css';

export default function SearchModal({ visible, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (query.trim().length < 1) {
        setResults([]);
        return;
      }
      
      setLoading(true);
      try {
        // We can use Yahoo Finance Search API directly from the client or create a proxy
        // Yahoo search is public and generally doesn't enforce CORS for search
        const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`);
        const json = await res.json();
        if (json && json.quotes) {
          setResults(json.quotes.filter(q => q.isYahooFinance));
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [query]);

  if (!visible) return null;

  return (
    <div className="search-modal">
      <div className="search-modal__header">
        <div className="search-modal__input-wrapper">
          <SearchOutline className="search-modal__icon" />
          <input 
            type="text"
            className="search-modal__input"
            placeholder="搜索股票代码/拼音/名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && <CloseOutline className="search-modal__clear" onClick={() => setQuery('')} />}
        </div>
        <div className="search-modal__cancel" onClick={onClose}>取消</div>
      </div>
      
      <div className="search-modal__content">
        {loading && <div className="search-modal__loading">搜索中...</div>}
        
        {!loading && results.length > 0 && (
          <div className="search-modal__results">
            {results.map((item, idx) => (
              <div 
                key={idx} 
                className="search-modal__result-item"
                onClick={() => {
                  onClose();
                  navigate(`/stock/${item.symbol}`);
                }}
              >
                <div className="search-modal__result-left">
                  <span className="search-modal__result-symbol">{item.symbol}</span>
                  <span className="search-modal__result-name">{item.shortname || item.longname}</span>
                </div>
                <div className="search-modal__result-right">
                  <span className="search-modal__result-exch">{item.exchDisp}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {!loading && query && results.length === 0 && (
          <div className="search-modal__empty">未找到匹配的股票</div>
        )}
      </div>
    </div>
  );
}
