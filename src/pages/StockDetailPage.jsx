import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toast } from 'antd-mobile';
import { LeftOutline, SearchOutline, CloseOutline, SendOutline } from 'antd-mobile-icons';
import KlineChart from '../components/Market/KlineChart';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
import { checkPriceAlerts } from '../utils/priceAlertRunner';
import { syncCloudAlerts } from '../utils/cloudAlerts';
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

const TREND_LABELS = {
  UPTREND: '上升趋势',
  DOWNTREND: '下降趋势',
  RECOVERING: '修复中',
  WEAKENING: '走弱中',
  RANGE_BOUND: '区间震荡',
  INSUFFICIENT_DATA: '数据不足',
};

const RISK_LABELS = {
  LOW: '低波动',
  MEDIUM: '中等波动',
  HIGH: '高波动',
};

const formatMetric = (value, suffix = '') => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return `${Number(value).toFixed(2)}${suffix}`;
};

const formatCompact = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return Number(value).toLocaleString();
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
  const { colorConvention, streamlitUrl, notificationConfig, marketDataConfig, saveNotificationConfig } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('1d');
  const [chartData, setChartData] = useState([]);
  const [quote, setQuote] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [alertCondition, setAlertCondition] = useState('ABOVE');
  const [alertTarget, setAlertTarget] = useState('');
  const [editingAlertId, setEditingAlertId] = useState(null);
  const [alertIntervalInput, setAlertIntervalInput] = useState(
    String(notificationConfig.alertCheckIntervalMinutes || 1)
  );
  const [optionChain, setOptionChain] = useState(null);
  const [optionLoading, setOptionLoading] = useState(false);
  const [optionExpiration, setOptionExpiration] = useState('');
  const [optionTypeFilter, setOptionTypeFilter] = useState('ALL');
  
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
    const fetchQuote = async () => {
      try {
        const normalizedSymbol = String(symbol || '').toUpperCase();
        const res = await fetch(`/api/market?symbols=${encodeURIComponent(normalizedSymbol)}`);
        const json = await res.json();
        const item = json?.data?.[normalizedSymbol] || json?.data?.[symbol];

        if (!mounted || !item) return;

        setQuote({
          regularMarketPrice: item.price,
          chartPreviousClose: item.prevClose,
          regularMarketDayHigh: item.regularMarketDayHigh,
          regularMarketDayLow: item.regularMarketDayLow,
          regularMarketOpen: item.regularMarketOpen,
          regularMarketVolume: item.regularMarketVolume,
          currency: item.currency || 'USD',
          longName: item.name,
        });
      } catch (err) {
        console.error('Failed to fetch quote:', err);
      }
    };

    fetchQuote();

    return () => { mounted = false; };
  }, [symbol]);

  useEffect(() => {
    setAlertIntervalInput(String(notificationConfig.alertCheckIntervalMinutes || 1));
  }, [notificationConfig.alertCheckIntervalMinutes]);

  useEffect(() => {
    let mounted = true;
    async function loadAlerts() {
      try {
        const rows = await db.getPriceAlertsBySymbol(String(symbol || '').toUpperCase());
        if (mounted) setPriceAlerts(rows || []);
      } catch (error) {
        console.warn('Failed to load price alerts:', error);
      }
    }
    loadAlerts();
    return () => { mounted = false; };
  }, [symbol]);

  useEffect(() => {
    let mounted = true;
    async function loadOptionChain() {
      setOptionLoading(true);
      try {
        const params = new URLSearchParams({
          symbol: String(symbol || '').toUpperCase(),
          provider: marketDataConfig.optionProvider || 'auto',
        });
        if (optionExpiration) params.set('expiration', optionExpiration);
        const res = await fetch(`/api/options-chain?${params.toString()}`, {
          headers: {
            ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
            ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
          },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '期权链加载失败');
        if (!mounted) return;
        setOptionChain(json);
        setOptionExpiration(json.selectedExpiration || '');
      } catch (error) {
        console.warn('Failed to fetch option chain:', error);
        if (mounted) setOptionChain(null);
      } finally {
        if (mounted) setOptionLoading(false);
      }
    }
    loadOptionChain();
    return () => { mounted = false; };
  }, [symbol, optionExpiration, marketDataConfig]);

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
          if (json.meta) {
            setQuote((current) => current || json.meta);
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

  useEffect(() => {
    let mounted = true;
    const fetchSnapshot = async () => {
      setSnapshotLoading(true);
      try {
        const res = await fetch(`/api/stock-snapshot?symbol=${encodeURIComponent(symbol)}`);
        const json = await res.json();
        if (mounted && json?.success) {
          setSnapshot(json);
        }
      } catch (err) {
        console.error('Failed to fetch stock snapshot:', err);
      } finally {
        if (mounted) setSnapshotLoading(false);
      }
    };

    fetchSnapshot();
    return () => { mounted = false; };
  }, [symbol]);

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

  const currentPrice = quote?.regularMarketPrice;
  const previousClose = quote?.chartPreviousClose;
  const hasDailyChange = Number.isFinite(currentPrice) && Number.isFinite(previousClose) && previousClose !== 0;
  const isUp = hasDailyChange ? currentPrice >= previousClose : false;
  let colorClass = 'neutral';
  if (quote) {
    if (colorConvention === 'red-up-green-down') {
      colorClass = isUp ? 'profit-red' : 'loss-green';
    } else {
      colorClass = isUp ? 'profit-green' : 'loss-red';
    }
  }

  const formatLargeNum = (num) => {
    return formatCompact(num);
  };

  const buildSnapshotMarkdown = () => {
    if (!snapshot) return '';
    const metrics = snapshot.metrics || {};
    const quoteData = snapshot.quote || {};
    return [
      `### ${String(symbol).toUpperCase()} 数据证据快照`,
      `- 来源：${snapshot.source?.provider || 'Yahoo Finance'}，${snapshot.source?.range || '1y'} ${snapshot.source?.interval || '1d'} 数据`,
      `- 价格：${formatMetric(quoteData.price)} ${snapshot.meta?.currency || 'USD'}，日涨跌 ${formatMetric(quoteData.dayChangePct, '%')}`,
      `- 趋势：${TREND_LABELS[metrics.trend] || metrics.trend || '--'}，风险：${RISK_LABELS[metrics.risk] || metrics.risk || '--'}`,
      `- 区间收益：1M ${formatMetric(metrics.return1m, '%')}，3M ${formatMetric(metrics.return3m, '%')}，6M ${formatMetric(metrics.return6m, '%')}，1Y ${formatMetric(metrics.return1y, '%')}`,
      `- 风险指标：年化波动 ${formatMetric(metrics.annualizedVolatility, '%')}，最大回撤 ${formatMetric(metrics.maxDrawdown, '%')}，52周位置 ${formatMetric(metrics.week52Position, '%')}`,
      `- 量能：当日成交量 ${formatCompact(quoteData.dayVolume)}，20日均量倍数 ${formatMetric(metrics.volumeRatio20, 'x')}`,
    ].join('\n');
  };

  const changeValue = hasDailyChange ? (currentPrice - previousClose).toFixed(2) : '0.00';
  const changePct = hasDailyChange ? ((currentPrice - previousClose) / previousClose * 100).toFixed(2) : '0.00';
  const sign = isUp ? '+' : '';
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const activeAlerts = priceAlerts.filter((alert) => alert.status === 'ACTIVE');
  const optionRows = (optionChain?.options || [])
    .filter((item) => optionTypeFilter === 'ALL' || item.type === optionTypeFilter)
    .sort((a, b) => (a.strike || 0) - (b.strike || 0))
    .slice(0, 40);

  const reloadAlerts = async () => {
    const rows = await db.getPriceAlertsBySymbol(normalizedSymbol);
    setPriceAlerts(rows || []);
  };

  const resetAlertForm = () => {
    setAlertCondition('ABOVE');
    setAlertTarget('');
    setEditingAlertId(null);
  };

  const handleSaveStockAlert = async () => {
    const target = Number(alertTarget);
    if (!Number.isFinite(target) || target <= 0) {
      Toast.show({ content: '请输入有效价格' });
      return;
    }

    if (editingAlertId) {
      await db.updatePriceAlert(editingAlertId, {
        condition: alertCondition,
        target_price: target,
        status: 'ACTIVE',
        triggered_at: null,
      });
      Toast.show({ icon: 'success', content: '提醒已更新' });
    } else {
      await db.addPriceAlert({
        id: crypto.randomUUID(),
        symbol: normalizedSymbol,
        asset_id: normalizedSymbol,
        asset_type: 'STOCK',
        condition: alertCondition,
        target_price: target,
        last_price: currentPrice || null,
        channels: null,
        note: `${normalizedSymbol} 股票提醒`,
      });
      Toast.show({ icon: 'success', content: '提醒已添加' });
    }

    resetAlertForm();
    await reloadAlerts();
    await syncCloudAlerts({ notificationConfig, marketDataConfig });
  };

  const handleEditAlert = (alert) => {
    setEditingAlertId(alert.id);
    setAlertCondition(alert.condition || 'ABOVE');
    setAlertTarget(String(alert.target_price || ''));
  };

  const handleDeleteAlert = async (alert) => {
    const confirmed = window.confirm(`删除 ${alert.asset_id || alert.symbol} 的价格提醒？`);
    if (!confirmed) return;
    await db.deletePriceAlert(alert.id);
    if (editingAlertId === alert.id) {
      resetAlertForm();
    }
    await reloadAlerts();
    await syncCloudAlerts({ notificationConfig, marketDataConfig });
    Toast.show({ icon: 'success', content: '提醒已删除' });
  };

  const handleSaveAlertInterval = async () => {
    const minutes = Number(alertIntervalInput);
    if (!Number.isFinite(minutes) || minutes < 1) {
      Toast.show({ content: '间隔至少为 1 分钟' });
      return;
    }
    const normalizedMinutes = Math.min(720, Math.round(minutes));
    const nextConfig = {
      ...notificationConfig,
      alertCheckIntervalMinutes: normalizedMinutes,
    };
    await saveNotificationConfig(nextConfig);
    await syncCloudAlerts({ notificationConfig: nextConfig, marketDataConfig });
    setAlertIntervalInput(String(normalizedMinutes));
    Toast.show({ icon: 'success', content: `自动检查间隔已设为 ${normalizedMinutes} 分钟` });
  };

  const handleAddOptionAlert = async (option) => {
    const defaultTarget = option.mark || option.last || option.bid || '';
    const input = window.prompt(`设置 ${option.contractSymbol} 目标价格`, defaultTarget);
    if (!input) return;
    const target = Number(input);
    if (!Number.isFinite(target) || target <= 0) {
      Toast.show({ content: '目标价格无效' });
      return;
    }
    await db.addPriceAlert({
      id: crypto.randomUUID(),
      symbol: normalizedSymbol,
      asset_id: option.contractSymbol,
      asset_type: 'OPTION',
      condition: 'ABOVE',
      target_price: target,
      last_price: option.mark || option.last || null,
      channels: null,
      note: `${option.expiration} ${option.type} ${option.strike}`,
    });
    await reloadAlerts();
    await syncCloudAlerts({ notificationConfig, marketDataConfig });
    Toast.show({ icon: 'success', content: '期权提醒已添加' });
  };

  const handleCheckAlertsNow = async () => {
    try {
      Toast.show({ icon: 'loading', content: '正在检查提醒...' });
      const triggered = await checkPriceAlerts(notificationConfig, marketDataConfig, normalizedSymbol);
      await reloadAlerts();
      Toast.show({
        icon: triggered.length ? 'success' : undefined,
        content: triggered.length ? `触发 ${triggered.length} 条提醒` : '暂无触发',
      });
    } catch (error) {
      Toast.show({ icon: 'fail', content: error.message || '检查失败' });
    }
  };

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
          {Number.isFinite(currentPrice) ? currentPrice.toFixed(2) : '--.--'}
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

      <div className="stock-detail__snapshot">
        <div className="stock-detail__snapshot-header">
          <div>
            <h3>数据证据快照</h3>
            <p>{snapshot?.meta?.name || symbol.toUpperCase()} · Yahoo Chart</p>
          </div>
          <button
            type="button"
            className="stock-detail__snapshot-copy"
            disabled={!snapshot}
            onClick={async () => {
              try {
                await copyText(buildSnapshotMarkdown());
                Toast.show({ content: '证据快照已复制' });
              } catch {
                Toast.show({ content: '复制失败' });
              }
            }}
          >
            复制证据
          </button>
        </div>

        {snapshotLoading && !snapshot ? (
          <div className="stock-detail__snapshot-loading">正在生成数据证据...</div>
        ) : snapshot ? (
          <>
            <div className="stock-detail__snapshot-tags">
              <span>{TREND_LABELS[snapshot.metrics?.trend] || '趋势未知'}</span>
              <span className={`risk-${String(snapshot.metrics?.risk || 'LOW').toLowerCase()}`}>
                {RISK_LABELS[snapshot.metrics?.risk] || '风险未知'}
              </span>
            </div>
            <div className="stock-detail__snapshot-grid">
              <div>
                <span>1M</span>
                <strong>{formatMetric(snapshot.metrics?.return1m, '%')}</strong>
              </div>
              <div>
                <span>3M</span>
                <strong>{formatMetric(snapshot.metrics?.return3m, '%')}</strong>
              </div>
              <div>
                <span>6M</span>
                <strong>{formatMetric(snapshot.metrics?.return6m, '%')}</strong>
              </div>
              <div>
                <span>年化波动</span>
                <strong>{formatMetric(snapshot.metrics?.annualizedVolatility, '%')}</strong>
              </div>
              <div>
                <span>最大回撤</span>
                <strong>{formatMetric(snapshot.metrics?.maxDrawdown, '%')}</strong>
              </div>
              <div>
                <span>52周位置</span>
                <strong>{formatMetric(snapshot.metrics?.week52Position, '%')}</strong>
              </div>
              <div>
                <span>20日量能</span>
                <strong>{formatMetric(snapshot.metrics?.volumeRatio20, 'x')}</strong>
              </div>
              <div>
                <span>样本数</span>
                <strong>{snapshot.meta?.observations || '--'}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="stock-detail__snapshot-loading">暂时无法生成数据证据</div>
        )}
      </div>

      <div className="stock-detail__alerts">
        <div className="stock-detail__module-header">
          <div>
            <h3>价格提醒</h3>
            <p>云端定时检查，本页也可手动触发</p>
          </div>
          <button type="button" onClick={handleCheckAlertsNow}>检查</button>
        </div>
        <div className="stock-detail__alert-interval">
          <span>自动检查间隔</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="720"
            value={alertIntervalInput}
            onChange={(event) => setAlertIntervalInput(event.target.value)}
          />
          <span>分钟</span>
          <button type="button" onClick={handleSaveAlertInterval}>保存</button>
        </div>
        <div className="stock-detail__alert-form">
          <select value={alertCondition} onChange={(e) => setAlertCondition(e.target.value)}>
            <option value="ABOVE">高于等于</option>
            <option value="BELOW">低于等于</option>
          </select>
          <input
            type="number"
            inputMode="decimal"
            placeholder="目标价格"
            value={alertTarget}
            onChange={(e) => setAlertTarget(e.target.value)}
          />
          <button type="button" onClick={handleSaveStockAlert}>
            {editingAlertId ? '更新' : '添加'}
          </button>
          {editingAlertId && (
            <button type="button" className="stock-detail__alert-cancel" onClick={resetAlertForm}>
              取消
            </button>
          )}
        </div>
        {activeAlerts.length > 0 ? (
          <div className="stock-detail__alert-list">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="stock-detail__alert-item">
                <span>{alert.asset_id || alert.symbol}</span>
                <strong>{alert.condition === 'ABOVE' ? '≥' : '≤'} {Number(alert.target_price).toFixed(2)}</strong>
                <div className="stock-detail__alert-actions">
                  <button type="button" onClick={() => handleEditAlert(alert)}>修改</button>
                  <button type="button" onClick={() => handleDeleteAlert(alert)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="stock-detail__alert-empty">暂无活动提醒</div>
        )}
      </div>

      <div className="stock-detail__options">
        <div className="stock-detail__module-header">
          <div>
            <h3>期权链</h3>
            <p>{optionChain?.provider || 'Auto'} · Bid / Ask / Mid / IV / Greeks</p>
          </div>
          {optionLoading && <span className="stock-detail__module-loading">加载中</span>}
        </div>
        <div className="stock-detail__options-controls">
          <select
            value={optionExpiration}
            onChange={(e) => setOptionExpiration(e.target.value)}
          >
            {(optionChain?.expirations || []).map((expiration) => (
              <option key={expiration} value={expiration}>{expiration}</option>
            ))}
          </select>
          <select
            value={optionTypeFilter}
            onChange={(e) => setOptionTypeFilter(e.target.value)}
          >
            <option value="ALL">全部</option>
            <option value="CALL">Call</option>
            <option value="PUT">Put</option>
          </select>
        </div>
        {optionRows.length > 0 ? (
          <div className="stock-detail__options-table">
            <div className="stock-detail__options-head">
              <span>合约</span>
              <span>Bid/Ask</span>
              <span>Mid</span>
              <span>IV/Delta</span>
              <span>量/OI</span>
            </div>
            {optionRows.map((option) => (
              <button
                type="button"
                key={option.contractSymbol}
                className="stock-detail__option-row"
                onClick={() => handleAddOptionAlert(option)}
              >
                <span>
                  <strong>{option.type}</strong>
                  <em>{option.strike}</em>
                </span>
                <span>{formatMetric(option.bid)} / {formatMetric(option.ask)}</span>
                <span>{formatMetric(option.mark)}</span>
                <span>{formatMetric(option.impliedVolatility ? option.impliedVolatility * 100 : null, '%')} / {formatMetric(option.delta)}</span>
                <span>{formatCompact(option.volume)} / {formatCompact(option.openInterest)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="stock-detail__alert-empty">
            {optionLoading ? '正在加载期权链...' : (optionChain?.message || '暂无可用期权链数据')}
          </div>
        )}
      </div>

      {/* AI Insights module */}
      <div className="stock-detail__ai-insights">
        <div className="ai-insights-header">
          <h3>近 30 天全网舆情</h3>
          <button 
            className="ai-btn"
            onClick={() => {
              if (streamlitUrl) {
                let url = streamlitUrl;
                if (!url.endsWith('/')) url += '/';
                const reportUrl = new URL(url);
                reportUrl.searchParams.set('q', symbol);
                reportUrl.searchParams.set('lang', 'zh');
                window.open(reportUrl.toString(), '_blank');
              } else {
                Toast.show({ content: '请先在设置页配置 AI 引擎地址' });
              }
            }}
          >
            生成分析报告
          </button>
        </div>
        <div className="ai-insights-content">
          <p>点击上方按钮，即可在新窗口拉起您的 Streamlit 专属 AI 引擎，生成 {symbol.toUpperCase()} 的中文舆情研究简报。</p>
        </div>
      </div>
    </div>
  );
}
