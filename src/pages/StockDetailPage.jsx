import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toast } from 'antd-mobile';
import { LeftOutline, SearchOutline, CloseOutline, SendOutline } from 'antd-mobile-icons';
import KlineChart from '../components/Market/KlineChart';
import { useAppStore } from '../stores/useAppStore';
import './StockDetailPage.css';

const SHARE_BASE_URL = 'https://invest-brain.vercel.app';

const TABS = [
  { id: '1m', label: '分时', interval: '1m', range: '1d' },
  { id: '5d', label: '5日', interval: '5m', range: '5d' },
  { id: '1d', label: '日K', interval: '1d', range: '6mo' },
  { id: '1wk', label: '周K', interval: '1wk', range: '2y' },
  { id: '1mo', label: '月K', interval: '1mo', range: '5y' },
  { id: '1y', label: '年K', interval: '3mo', range: '10y' } // pseudo year K
];

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

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
};

export default function StockDetailPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { colorConvention, streamlitUrl } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('1d');
  const [chartData, setChartData] = useState([]);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Inline search states
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!isSearching) {
      setQuery('');
      setSearchResults([]);
    } else {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isSearching]);

  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (query.trim().length < 1) {
        setSearchResults([]);
        return;
      }
      
      setLoadingSearch(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (json && json.success && json.data) {
          setSearchResults(normalizeSearchResults(json.data));
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoadingSearch(false);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [query]);
  
  useEffect(() => {
    let mounted = true;
    const fetchChartData = async () => {
      setLoading(true);
      try {
        const tabConfig = TABS.find(t => t.id === activeTab);
        const res = await fetch(`/api/kline?symbol=${symbol}&interval=${tabConfig.interval}&range=${tabConfig.range}`);
        const json = await res.json();
        
        if (json.success && mounted) {
          setChartData(json.data);
          // Set quote info from the meta if we don't have real time quote yet
          if (json.meta) {
            setQuote(json.meta);
          }
        }
      } catch (err) {
        console.error('Failed to fetch chart:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchChartData();
    
    return () => { mounted = false; };
  }, [symbol, activeTab]);

  const handleShare = async () => {
    const normalizedSymbol = String(symbol || '').toUpperCase();
    const shareUrl = new URL(`/stock/${encodeURIComponent(normalizedSymbol)}`, SHARE_BASE_URL).toString();
    const shareData = {
      title: `${normalizedSymbol} 实时行情`,
      text: `查看 ${normalizedSymbol} 实时行情、K线和全网舆情`,
      url: shareUrl,
    };

    try {
      await copyText(shareUrl);

      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      Toast.show({ content: '股票链接已复制，可粘贴到微信发送' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        Toast.show({ content: '股票链接已复制，可粘贴到微信发送' });
        return;
      }

      try {
        await copyText(shareUrl);
        Toast.show({ content: '股票链接已复制，可粘贴到微信发送' });
      } catch {
        Toast.show({ content: shareUrl, duration: 4000 });
      }
    }
  };

  const isUp = quote && quote.regularMarketPrice >= quote.chartPreviousClose;
  let colorClass = 'neutral';
  if (quote) {
    if (colorConvention === 'red-up-green-down') {
      colorClass = isUp ? 'profit-red' : 'loss-green';
    } else {
      colorClass = isUp ? 'profit-green' : 'loss-red';
    }
  }

  const formatLargeNum = (num) => {
    if (!num) return '-';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e4) return (num / 1e4).toFixed(2) + '万';
    return num.toLocaleString();
  };

  const changeValue = quote ? (quote.regularMarketPrice - quote.chartPreviousClose).toFixed(2) : '0.00';
  const changePct = quote ? ((quote.regularMarketPrice - quote.chartPreviousClose) / quote.chartPreviousClose * 100).toFixed(2) : '0.00';
  const sign = isUp ? '+' : '';

  return (
    <div className="stock-detail-page">
      {isSearching ? (
        // Active Search Header
        <div className="flex items-center gap-3 px-4 h-11 mb-2">
          <div className="flex-1 flex items-center gap-2 bg-white/10 rounded-full h-9 px-3 border border-white/5">
            <SearchOutline className="text-gray-400 text-base flex-shrink-0" />
            <input 
              ref={searchInputRef}
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
        // Standard Navbar
        <div className="stock-detail__navbar">
          <LeftOutline className="stock-detail__back" onClick={() => navigate(-1)} />
          <div className="stock-detail__nav-title">
            <div className="stock-detail__symbol">{symbol.toUpperCase()}</div>
            <div className="stock-detail__market-status">实时行情 (USD)</div>
          </div>
          <div className="stock-detail__actions">
            <button
              type="button"
              className="stock-detail__action-button"
              aria-label="搜索股票"
              onClick={() => setIsSearching(true)}
            >
              <SearchOutline />
            </button>
            <button
              type="button"
              className="stock-detail__action-button"
              aria-label="分享股票"
              onClick={handleShare}
            >
              <SendOutline />
            </button>
          </div>
        </div>
      )}

      {/* Search overlay & result list */}
      {isSearching && (
        <div className="fixed inset-x-0 bottom-0 top-[calc(44px+8px+var(--safe-area-top))] bg-[#0B0E14]/98 z-50 overflow-y-auto px-4 pb-20">
          {query.trim().length === 0 ? (
            // Mask layer
            <div className="fixed inset-x-0 bottom-0 top-[calc(44px+8px+var(--safe-area-top))] bg-black/60 -mx-4" />
          ) : (
            // Search Results Panel
            <div className="py-2">
              {loadingSearch && (
                <div className="py-8 text-center text-gray-400 text-sm">搜索中...</div>
              )}
              
              {!loadingSearch && searchResults.length > 0 && (
                <div className="flex flex-col">
                  {searchResults.map((item, idx) => (
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
              
              {!loadingSearch && searchResults.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">未找到匹配的股票</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="stock-detail__header">
        <div className={`stock-detail__price ${colorClass} font-extrabold`}>
          {quote ? quote.regularMarketPrice.toFixed(2) : '--.--'}
        </div>
        <div className={`stock-detail__changes ${colorClass} flex items-center gap-3`}>
          <span>{sign}{changeValue}</span>
          <span>{sign}{changePct}%</span>
        </div>
      </div>

      <div className="stock-detail__metrics">
        <div className="metric-col">
          <div className="metric-item">
            <span className="label">最高</span>
            <span className="value">{quote?.regularMarketDayHigh?.toFixed(2) || '-'}</span>
          </div>
          <div className="metric-item">
            <span className="label">最低</span>
            <span className="value">{quote?.regularMarketDayLow?.toFixed(2) || '-'}</span>
          </div>
        </div>
        <div className="metric-col">
          <div className="metric-item">
            <span className="label">今开</span>
            <span className="value">{quote?.regularMarketOpen?.toFixed(2) || '-'}</span>
          </div>
          <div className="metric-item">
            <span className="label">昨收</span>
            <span className="value">{quote?.chartPreviousClose?.toFixed(2) || '-'}</span>
          </div>
        </div>
        <div className="metric-col">
          <div className="metric-item">
            <span className="label">成交量</span>
            <span className="value">{formatLargeNum(quote?.regularMarketVolume)}</span>
          </div>
        </div>
      </div>

      <div className="stock-detail__tabs">
        {TABS.map(tab => (
          <div 
            key={tab.id} 
            className={`stock-detail__tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="stock-detail__chart-container">
        {loading ? (
          <div className="chart-loading">正在加载专业图表...</div>
        ) : (
          <KlineChart data={chartData} interval={activeTab} />
        )}
      </div>

      {/* AI Insights module */}
      <div className="stock-detail__ai-insights">
        <div className="ai-insights-header">
          <h3>全网舆情 (Last 30 Days)</h3>
          <button 
            className="ai-btn"
            onClick={() => {
              if (streamlitUrl) {
                let url = streamlitUrl;
                if (!url.endsWith('/')) url += '/';
                window.open(`${url}?q=${symbol}`, '_blank');
              } else {
                Toast.show({ content: '请先在设置页配置 AI 引擎地址' });
              }
            }}
          >
            生成分析报告
          </button>
        </div>
        <div className="ai-insights-content">
          <p>点击上方按钮，即可在新窗口拉起您的 Streamlit 专属 AI 引擎，拉取 {symbol.toUpperCase()} 近 30 天的全网舆情报告。</p>
        </div>
      </div>
    </div>
  );
}
