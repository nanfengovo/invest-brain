import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LeftOutline, SearchOutline } from 'antd-mobile-icons';
import KlineChart from '../components/Market/KlineChart';
import SearchModal from '../components/common/SearchModal';
import { useAppStore } from '../stores/useAppStore';
import './StockDetailPage.css';

const TABS = [
  { id: '1m', label: '分时', interval: '1m', range: '1d' },
  { id: '5d', label: '5日', interval: '5m', range: '5d' },
  { id: '1d', label: '日K', interval: '1d', range: '6mo' },
  { id: '1wk', label: '周K', interval: '1wk', range: '2y' },
  { id: '1mo', label: '月K', interval: '1mo', range: '5y' },
  { id: '1y', label: '年K', interval: '3mo', range: '10y' } // pseudo year K
];

export default function StockDetailPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { colorConvention } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('1d');
  const [chartData, setChartData] = useState([]);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  
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
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${symbol} - InvestBrain`,
          url: window.location.href,
        });
      } else {
        alert('系统不支持原生分享，链接已复制到剪贴板！');
        navigator.clipboard.writeText(window.location.href);
      }
    } catch (e) {
      console.log('Share error:', e);
    }
  };

  const isUp = quote && quote.regularMarketPrice >= quote.previousClose;
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

  const changeValue = quote ? (quote.regularMarketPrice - quote.previousClose).toFixed(2) : '0.00';
  const changePct = quote ? ((quote.regularMarketPrice - quote.previousClose) / quote.previousClose * 100).toFixed(2) : '0.00';
  const sign = isUp ? '+' : '';

  return (
    <div className="stock-detail-page">
      <div className="stock-detail__navbar">
        <LeftOutline className="stock-detail__back" onClick={() => navigate(-1)} />
        <div className="stock-detail__nav-title">
          <div className="stock-detail__symbol">{symbol.toUpperCase()}</div>
          <div className="stock-detail__market-status">实时行情 (USD)</div>
        </div>
        <div className="stock-detail__actions">
          <SearchOutline onClick={() => setSearchVisible(true)} />
          <svg onClick={handleShare} viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
          </svg>
        </div>
      </div>

      <div className="stock-detail__header">
        <div className={`stock-detail__price ${colorClass}`}>
          {quote ? quote.regularMarketPrice.toFixed(2) : '--.--'}
        </div>
        <div className={`stock-detail__changes ${colorClass}`}>
          {sign}{changeValue} {sign}{changePct}%
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
            <span className="value">{quote?.previousClose?.toFixed(2) || '-'}</span>
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

      {/* Placeholder for AI Insights module */}
      <div className="stock-detail__ai-insights">
        <div className="ai-insights-header">
          <h3>全网舆情 (Last 30 Days)</h3>
          <button 
            className="ai-btn"
            onClick={() => {
              // 提醒用户去配置他们自己部署的 Streamlit URL
              const url = window.prompt("请输入您部署成功的 Streamlit URL (例如: https://xxx.streamlit.app):");
              if (url) {
                window.open(`${url}?q=${symbol}`, '_blank');
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
      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />
    </div>
  );
}
