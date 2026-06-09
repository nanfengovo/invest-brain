import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toast } from 'antd-mobile';
import { LeftOutline, SearchOutline, CloseOutline, SendOutline } from 'antd-mobile-icons';
import KlineChart from '../components/Market/KlineChart';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
import { checkPriceAlerts } from '../utils/priceAlertRunner';
import { syncCloudAlerts } from '../utils/cloudAlerts';
import { getMoneynessMonitor, parseOptionAlertInput } from '../utils/optionMonitoring';
import { getFieldHelp } from '../utils/marketFieldGlossary';
import { sharePoster } from '../utils/sharePoster';
import { buildApiCacheKey, fetchJsonWithCache } from '../utils/apiCache';
import './StockDetailPage.css';

const SHARE_BASE_URL = 'https://invest-brain.vercel.app';
const KLINE_CACHE_VERSION = 'real-ohlc-v2';

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
  const number = Number(value);
  const sign = number < 0 ? '-' : '';
  const abs = Math.abs(number);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return number.toLocaleString();
};

const formatPercentFromRatio = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return `${(Number(value) * 100).toFixed(2)}%`;
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '--';
  const number = Number(value);
  return `${number < 0 ? '-' : ''}$${formatCompact(Math.abs(number))}`;
};

const formatProfileValue = (value, type = 'text') => {
  if (value === null || value === undefined || value === '') return '--';
  if (type === 'money') return formatMoney(value);
  if (type === 'ratioPercent') return formatPercentFromRatio(value);
  if (type === 'number') return formatCompact(value);
  if (type === 'multiple') return Number(value).toFixed(2);
  if (type === 'url') {
    return String(value).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
  return String(value);
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const formatOptionalRatio = (value) => (hasValue(value) ? formatPercentFromRatio(value) : '--');

const formatAnalystRecommendation = (value) => {
  const map = {
    1: '强烈买入',
    2: '买入',
    3: '持有',
    4: '卖出',
    5: '强烈卖出',
    6: '跑输',
    7: '无评级',
  };
  return map[Number(value)] || '--';
};

const getFinancialReportTitle = (key) => ({
  incomeStatement: '利润表',
  balanceSheet: '资产负债表',
  cashFlow: '现金流量表',
}[key] || key);

const formatCompanyActionDate = (item = {}) => {
  const raw = String(item.date || item.dateText || '').trim();
  if (!raw) return '--';
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
};

const getLongbridgeModuleSummary = (company = {}) => {
  const sources = company.longbridgeDataSources || {};
  const errors = company.longbridgeDataErrors || {};
  const labels = {
    quote: '实时行情',
    staticInfo: '基础资料',
    company: '公司概览',
    financialReport: '财务三表',
    valuation: '估值',
    valuationHistory: '估值历史',
    industryValuation: '同业估值',
    valuationComparison: '估值对比',
    industryDistribution: '行业分布',
    institutionRating: '机构评级',
    institutionRatingDetail: '评级历史',
    ratings: '综合评分',
    dividend: '分红',
    dividendDetail: '分红详情',
    shareholder: '主要股东',
    shareholderTop: '股东排行',
    fundHolder: '基金持仓',
    executive: '管理层',
    operating: '经营摘要',
    corpAction: '公司行动',
    investRelation: '投资关系',
    buyback: '回购',
    forecastEps: 'EPS预测',
    consensus: '一致预期',
    valuationDetail: '估值解读',
    financialSnapshot: '财报快照',
  };
  const loaded = Object.entries(labels)
    .filter(([key]) => sources[key])
    .map(([, label]) => label);
  const failed = Object.entries(errors || {})
    .filter(([key]) => !(loaded.length >= 8 && key.startsWith('http')))
    .filter(([, message]) => message)
    .map(([key, message]) => ({
      key,
      label: labels[key] || key,
      message,
    }));
  return { loaded, failed };
};

const normalizeIndustryLabel = (value, fallback = '') => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const invalid = new Set(['USMAIN', 'USPINK', 'USSECTOR', 'USOPTION', 'HKSECTOR', 'HKEQUITY']);
  return invalid.has(text.replace(/[\s_-]/g, '').toUpperCase()) ? fallback : text;
};

const formatQuoteTimestamp = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatOptionStrike = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const buildMarketDataHeaders = (marketDataConfig = {}) => ({
  ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
  ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
  ...(marketDataConfig.marketDataToken ? { 'X-MarketData-Token': marketDataConfig.marketDataToken } : {}),
  ...(marketDataConfig.longbridgeAppKey ? { 'X-Longbridge-App-Key': marketDataConfig.longbridgeAppKey } : {}),
  ...(marketDataConfig.longbridgeAppSecret ? { 'X-Longbridge-App-Secret': marketDataConfig.longbridgeAppSecret } : {}),
  ...(marketDataConfig.longbridgeAccessToken ? { 'X-Longbridge-Access-Token': marketDataConfig.longbridgeAccessToken } : {}),
});

const hashCredential = (value) => {
  const text = String(value || '');
  if (!text) return '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
};

const getMarketDataConfigFingerprint = (marketDataConfig = {}) => [
  marketDataConfig.optionProvider || 'auto',
  marketDataConfig.tradierToken ? `tradier:${hashCredential(marketDataConfig.tradierToken)}` : '',
  marketDataConfig.polygonToken ? `polygon:${hashCredential(marketDataConfig.polygonToken)}` : '',
  marketDataConfig.marketDataToken ? `marketdata:${hashCredential(marketDataConfig.marketDataToken)}` : '',
  marketDataConfig.longbridgeAppKey && marketDataConfig.longbridgeAccessToken
    ? `longbridge:${hashCredential(`${marketDataConfig.longbridgeAppKey}:${marketDataConfig.longbridgeAccessToken}`)}`
    : '',
].filter(Boolean).join(':') || 'public';

const FIELD_HELP_SECTIONS = [
  ['example', '拿这笔交易举例'],
  ['formula', '怎么读 / 怎么算'],
  ['usage', '看盘时怎么用'],
  ['risk', '最容易踩的坑'],
];

const OPTION_FIELD_COLUMNS = [
  { key: 'expiration', label: 'EXP / DTE' },
  { key: 'bidAsk', label: 'Bid/Ask' },
  { key: 'mark', label: 'Mark' },
  { key: 'last', label: 'Last' },
  { key: 'previousClose', label: '昨收' },
  { key: 'dayChange', label: '日变动' },
  { key: 'impliedVolatility', label: 'IV' },
  { key: 'delta', label: 'Delta' },
  { key: 'gamma', label: 'Gamma' },
  { key: 'theta', label: 'Theta' },
  { key: 'vega', label: 'Vega' },
  { key: 'volume', label: 'Volume' },
  { key: 'openInterest', label: 'OI' },
  { key: 'intrinsicValue', label: '内在' },
  { key: 'extrinsicValue', label: '外在' },
  { key: 'moneyness', label: 'ITM/OTM' },
];

const formatDerivativeSupport = (items = []) => {
  const labels = {
    0: '期权',
    1: '窝轮',
    2: '牛熊证',
  };
  return items
    .map((item) => labels[item] || labels[String(item)] || String(item || '').trim())
    .filter((item) => item && item !== 'undefined' && item !== 'null');
};

const getOptionDte = (expiration) => {
  if (!expiration) return null;
  const expiryDate = new Date(`${expiration}T23:59:59-04:00`);
  if (Number.isNaN(expiryDate.getTime())) return null;
  const diffMs = expiryDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
};

const formatOptionExpirationDte = (expiration) => {
  const dte = getOptionDte(expiration);
  if (!expiration && dte === null) return '--';
  if (dte === null) return expiration;
  if (dte === 0) return `${expiration} · 0DTE`;
  return `${expiration} · ${dte}D`;
};

const formatSignedMetric = (value, suffix = '') => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const number = Number(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}${suffix}`;
};

const formatOptionDayChange = (option = {}) => {
  const change = option.change;
  const pct = option.percentChange;
  if ((change === null || change === undefined) && (pct === null || pct === undefined)) return '--';
  return `${formatSignedMetric(change)} / ${formatSignedMetric(pct, '%')}`;
};

const isSyntheticKlinePayload = (payload = {}) => {
  const source = payload.dataSource || {};
  const meta = payload.meta || {};
  const text = [
    source.provider,
    source.note,
    source.fallbackReason,
    meta.dataSource,
  ].filter(Boolean).join(' ');

  return Boolean(source.synthetic || /quote reference|报价生成参考图|最新报价生成参考图/i.test(text));
};

const normalizeRenderableKlineRows = (rows = []) => rows
  .filter((item) => Array.isArray(item) && item.length >= 5)
  .filter((item) => {
    const open = Number(item[1]);
    const close = Number(item[2]);
    const low = Number(item[3]);
    const high = Number(item[4]);
    return [open, close, low, high].every((value) => Number.isFinite(value) && value > 0)
      && high >= Math.max(open, close, low)
      && low <= Math.min(open, close, high);
  });

const formatAlertAssetLabel = (alert) => {
  const assetType = String(alert.asset_type || 'STOCK').toUpperCase();
  if (assetType !== 'OPTION') {
    return {
      title: alert.asset_id || alert.symbol,
      subtitle: '股票提醒',
      badge: '股票',
    };
  }

  return {
    title: alert.asset_id || alert.symbol,
    subtitle: alert.note || `${alert.symbol} 期权提醒`,
    badge: '期权',
  };
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
  const marketDataFingerprint = getMarketDataConfigFingerprint(marketDataConfig);
  
  const [activeTab, setActiveTab] = useState('1d');
  const [chartData, setChartData] = useState([]);
  const [chartError, setChartError] = useState('');
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
  const [optionSourceExpanded, setOptionSourceExpanded] = useState(false);
  const [detailMode, setDetailMode] = useState('stock');
  const [fieldHelp, setFieldHelp] = useState(null);
  
  // Inline search states
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef(null);
  const optionSymbolRef = useRef('');

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
        const url = `/api/market?symbols=${encodeURIComponent(normalizedSymbol)}`;
        const { data: json } = await fetchJsonWithCache(url, {}, {
          cacheKey: buildApiCacheKey(['stock-detail-market', normalizedSymbol]),
          ttlMs: 5_000,
          staleTtlMs: 60_000,
          timeoutMs: 5_000,
        });
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
        const normalizedSymbol = String(symbol || '').toUpperCase();
        const requestExpiration = optionSymbolRef.current === normalizedSymbol ? optionExpiration : '';
        if (optionSymbolRef.current !== normalizedSymbol) {
          optionSymbolRef.current = normalizedSymbol;
          if (optionExpiration) setOptionExpiration('');
        }
        const params = new URLSearchParams({
          symbol: normalizedSymbol,
          provider: marketDataConfig.optionProvider || 'auto',
        });
        if (requestExpiration) params.set('expiration', requestExpiration);
        const url = `/api/options-chain?${params.toString()}`;
        const { data: json } = await fetchJsonWithCache(url, {
          headers: buildMarketDataHeaders(marketDataConfig),
        }, {
          cacheKey: buildApiCacheKey([
            'stock-detail-options',
            normalizedSymbol,
            requestExpiration || 'front',
            marketDataFingerprint,
          ]),
          ttlMs: 20_000,
          staleTtlMs: 5 * 60_000,
          timeoutMs: 12_000,
        });
        if (!mounted) return;
        setOptionChain(json);
      } catch (error) {
        console.warn('Failed to fetch option chain:', error);
        if (mounted) {
          setOptionChain({
            success: false,
            symbol: String(symbol || '').toUpperCase(),
            provider: marketDataConfig.optionProvider || 'auto',
            generatedAt: new Date().toISOString(),
            expirations: optionExpiration ? [optionExpiration] : [],
            selectedExpiration: optionExpiration || null,
            options: [],
            message: error.message || '期权链加载失败，请检查数据源配置。',
            dataSource: {
              error: error.message || '期权链加载失败，请检查数据源配置。',
            },
          });
        }
      } finally {
        if (mounted) setOptionLoading(false);
      }
    }
    loadOptionChain();
    return () => { mounted = false; };
  }, [symbol, optionExpiration, marketDataFingerprint]);

  useEffect(() => {
    let mounted = true;
    const fetchChartData = async () => {
      setLoading(true);
      setChartError('');
      try {
        const tabConfig = TABS.find(t => t.id === activeTab);
        const url = `/api/kline?symbol=${symbol}&interval=${tabConfig.interval}&range=${tabConfig.range}`;
        const { data: json } = await fetchJsonWithCache(url, {
          headers: buildMarketDataHeaders(marketDataConfig),
        }, {
          cacheKey: buildApiCacheKey([
            'stock-detail-kline',
            KLINE_CACHE_VERSION,
            symbol,
            tabConfig.interval,
            tabConfig.range,
            marketDataFingerprint,
          ]),
          ttlMs: activeTab === '1m' ? 8_000 : 60_000,
          staleTtlMs: 10 * 60_000,
          timeoutMs: 8_000,
        });
        
        if (json.success && mounted) {
          const rows = isSyntheticKlinePayload(json) ? [] : normalizeRenderableKlineRows(json.data);
          setChartData(rows);
          setChartError(json.dataSource?.note || '');
          if (json.meta) {
            setQuote((current) => current || json.meta);
          }
          if (!rows.length) {
            setChartError(
              isSyntheticKlinePayload(json)
                ? '已忽略旧缓存中的报价参考图，正在等待真实 K 线数据。'
                : '图表接口暂未返回可用 K 线，稍后会自动重试。'
            );
          }
        }
      } catch (err) {
        console.error('Failed to fetch chart:', err);
        if (mounted) {
          setChartData([]);
          setChartError('图表接口暂不可用，稍后会自动重试。');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchChartData();
    
    return () => { mounted = false; };
  }, [symbol, activeTab, marketDataConfig, marketDataFingerprint]);

  useEffect(() => {
    let mounted = true;
    const fetchSnapshot = async () => {
      setSnapshotLoading(true);
      try {
        const url = `/api/stock-snapshot?symbol=${encodeURIComponent(symbol)}`;
        const { data: json } = await fetchJsonWithCache(url, {
          headers: buildMarketDataHeaders(marketDataConfig),
        }, {
          cacheKey: buildApiCacheKey([
            'stock-snapshot',
            String(symbol || '').toUpperCase(),
            marketDataFingerprint,
          ]),
          ttlMs: 5 * 60_000,
          staleTtlMs: 60 * 60_000,
          timeoutMs: 18_000,
        });
        if (mounted && json?.success) {
          setSnapshot(json);
          if (json.quote?.price) {
            setQuote((current) => ({
              ...(current || {}),
              regularMarketPrice: current?.regularMarketPrice ?? json.quote.price,
              chartPreviousClose: current?.chartPreviousClose ?? json.quote.previousClose,
              regularMarketDayHigh: current?.regularMarketDayHigh ?? json.quote.dayHigh,
              regularMarketDayLow: current?.regularMarketDayLow ?? json.quote.dayLow,
              regularMarketOpen: current?.regularMarketOpen ?? json.quote.dayOpen,
              regularMarketVolume: current?.regularMarketVolume ?? json.quote.dayVolume,
              currency: current?.currency || json.meta?.currency || json.company?.currency || 'USD',
              longName: current?.longName || json.company?.name || json.meta?.name,
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch stock snapshot:', err);
      } finally {
        if (mounted) setSnapshotLoading(false);
      }
    };

    fetchSnapshot();
    return () => { mounted = false; };
  }, [symbol, marketDataFingerprint]);

  const handleShare = async () => {
    const normalizedSymbol = String(symbol || '').toUpperCase();
    const shareUrl = new URL(`/stock/${encodeURIComponent(normalizedSymbol)}`, SHARE_BASE_URL).toString();
    const price = quote?.regularMarketPrice;
    const previous = quote?.chartPreviousClose;
    const hasChange = Number.isFinite(price) && Number.isFinite(previous) && previous !== 0;
    const dailyChange = hasChange ? price - previous : 0;
    const dailyChangePct = hasChange ? (dailyChange / previous) * 100 : 0;
    const companyData = snapshot?.company || {};
    const metrics = snapshot?.metrics || {};
    const optionData = optionChain?.dataSource || {};
    const optionSummary = optionChain?.selectedExpiration
      ? `${optionChain.selectedExpiration.slice(5)} · ${optionData.optionCount || (optionChain.options || []).length || '--'} 合约`
      : '期权链待返回';

    try {
      Toast.show({ icon: 'loading', content: '正在生成股票分享图...' });
      const result = await sharePoster({
        skipBackgroundPicker: true,
        template: 'stock-snapshot',
        title: `${normalizedSymbol} 股票快照`,
        subtitle: quote?.longName || snapshot?.meta?.name || normalizedSymbol,
        typeLabel: '股票快照',
        shareText: `查看 ${normalizedSymbol} 实时行情、K线和期权链`,
        fileName: `investbrain-stock-${normalizedSymbol}-${Date.now()}.png`,
        footer: `分享链接：${shareUrl}`,
        stock: {
          symbol: normalizedSymbol,
          name: quote?.longName || companyData.name || snapshot?.meta?.name || normalizedSymbol,
          currency: quote?.currency || snapshot?.meta?.currency || 'USD',
          price,
          change: dailyChange,
          changePct: dailyChangePct,
          high: quote?.regularMarketDayHigh,
          low: quote?.regularMarketDayLow,
          previousClose: quote?.chartPreviousClose,
          volume: quote?.regularMarketVolume || snapshot?.quote?.dayVolume,
          marketCap: companyData.marketCap,
          trailingPE: companyData.trailingPE,
          sector: companyData.sector,
          industry: companyData.industry,
          trendLabel: TREND_LABELS[metrics.trend] || metrics.trend,
          riskLabel: RISK_LABELS[metrics.risk] || metrics.risk,
          week52Position: Number.isFinite(Number(metrics.week52Position))
            ? `${Number(metrics.week52Position).toFixed(0)}%`
            : '--',
          chartData,
          optionSummary,
          sourceLabel: [
            companyData.providers?.longbridge === 'ok' ? 'Longbridge' : '',
            snapshot?.source?.provider || 'Yahoo Chart',
            optionData.isRealApiData ? 'MarketData.app' : '',
          ].filter(Boolean).join(' · '),
        },
      });
      Toast.show({ icon: 'success', content: result.mode === 'native' ? '股票分享图已发送' : '股票分享图已下载' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        Toast.show({ content: '已取消分享图发送' });
        return;
      }

      try {
        await copyText(shareUrl);
        Toast.show({ content: '分享图生成失败，股票链接已复制' });
      } catch {
        Toast.show({ icon: 'fail', content: error.message || '股票分享图生成失败' });
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
  const company = snapshot?.company || {};
  const longbridgeModuleSummary = getLongbridgeModuleSummary(company);
  const companyRatings = company.ratings || {};
  const ratingDistribution = companyRatings.distribution || {};
  const companyShareholders = company.shareholders?.top || [];
  const companyExecutives = company.executives?.people || [];
  const companyOperating = company.operating || null;
  const companyConsensusDetails = company.consensus?.details || [];
  const companyPeerItems = company.industryPeers?.peers || [];
  const companyValuationPeers = company.valuationComparison?.peers || [];
  const companyDistribution = company.industryDistribution || {};
  const financialReportCards = company.financialReports?.cards || [];
  const financialReportSections = Object.entries(company.financialReports?.reports || {})
    .filter(([, report]) => report?.rows?.length);
  const companyDividends = company.dividends?.items || [];
  const companyFundHolders = company.fundHolders?.items || [];
  const companyCorpActions = company.corpActions?.items || [];
  const companyInvestRelations = company.investRelations?.items || [];
  const companyBuyback = company.buyback || null;
  const hasBuybackTtm = companyBuyback?.recent?.netBuybackTtm !== null
    && companyBuyback?.recent?.netBuybackTtm !== undefined;
  const corporateEventCount = companyDividends.length
    + companyFundHolders.length
    + companyCorpActions.length
    + companyInvestRelations.length
    + (hasBuybackTtm ? 1 : 0);
  const displaySector = normalizeIndustryLabel(company.sector, '行业待补充');
  const displayIndustry = normalizeIndustryLabel(
    company.industry,
    normalizeIndustryLabel(company.ratings?.industryName, '细分行业待补充')
  );
  const industryRankValue = company.industryRank?.position && company.industryRank?.total
    ? `${company.industryRank.position}/${company.industryRank.total}`
    : (company.industryRank?.percentile ? `Top ${100 - company.industryRank.percentile}%` : '--');
  const industryRankSourceLabel = company.industryRank?.source === 'longbridge'
    ? '长桥行业排名'
    : '行业强度估算';
  const industryRankNote = company.industryRank?.source === 'longbridge'
    ? '来自长桥评级/估值分布模块，适合作为行业内相对位置参考。'
    : '基于市值、增长、利润率、ROE、Beta 的本地评分，不等同券商排名。';
  const companyLocationLabel = [company.country, company.city].filter(Boolean).join(' · ')
    || company.exchangeName
    || quote?.exchangeName
    || company.board
    || company.market
    || company.region
    || '--';
  const companyAddressLabel = company.officeAddress || '地址待补充';
  const companyWebsiteLabel = company.website ? formatProfileValue(company.website, 'url') : '官网待补充';
  const companyExchangeLabel = company.exchangeName || quote?.exchangeName || company.board || company.market || '--';
  const analystTargetLabel = formatProfileValue(
    companyRatings.targetPrice || company.targetPrice || company.targetMeanPrice,
    'money'
  );
  const derivativeSupport = formatDerivativeSupport(company.stockDerivatives || []);
  const activeAlerts = priceAlerts.filter((alert) => alert.status === 'ACTIVE');
  const optionSpotPrice = Number.isFinite(currentPrice) ? currentPrice : Number(snapshot?.quote?.price);
  const hasOptionSpotPrice = Number.isFinite(optionSpotPrice) && optionSpotPrice > 0;
  const optionDataSource = optionChain?.dataSource || {};
  const optionProvider = optionChain?.provider || 'Auto';
  const optionCount = Number.isFinite(Number(optionDataSource.optionCount))
    ? Number(optionDataSource.optionCount)
    : (optionChain?.options || []).length;
  const optionSourceTone = optionDataSource.dataMode === 'delayed_or_historical' ? 'limited' : 'ok';
  const optionSourceLabel = optionDataSource.isRealApiData
    ? (optionDataSource.dataMode === 'delayed_or_historical' ? '真实 API · 延迟/历史' : '真实 API · 权限决定实时')
    : `${optionProvider} 数据`;
  const optionRows = (optionChain?.options || [])
    .filter((item) => optionTypeFilter === 'ALL' || item.type === optionTypeFilter)
    .map((item) => {
      const strike = Number(item.strike);
      return {
        ...item,
        atmDistance: hasOptionSpotPrice && Number.isFinite(strike) ? Math.abs(strike - optionSpotPrice) : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      const distance = a.atmDistance - b.atmDistance;
      if (Number.isFinite(distance) && distance !== 0) return distance;
      const strikeDiff = (Number(a.strike) || 0) - (Number(b.strike) || 0);
      if (strikeDiff !== 0) return strikeDiff;
      if (a.type === b.type) return 0;
      return a.type === 'CALL' ? -1 : 1;
    })
    .slice(0, 40);
  const nearAtmOptions = optionRows
    .map((option) => ({
      ...option,
      money: getMoneynessMonitor({
        underlyingPrice: optionSpotPrice,
        strikePrice: option.strike,
        optionType: option.type,
      }),
    }));
  const optionUpdatedAt = optionDataSource.quoteUpdatedAt || nearAtmOptions
    .map((option) => option.updated)
    .find((value) => value !== null && value !== undefined && value !== '');
  const optionGeneratedAt = formatQuoteTimestamp(optionChain?.generatedAt);
  const effectiveOptionExpiration = optionExpiration || optionChain?.selectedExpiration || '';
  const optionDataNote = optionDataSource.note || (optionChain?.provider === 'MarketData.app'
    ? '真实数据来自 MarketData.app；免费层通常为延迟/历史数据，是否实时取决于你的套餐与 OPRA 权限。'
    : `${optionProvider} 返回的期权报价；请以券商成交页为最终下单依据。`);
  const optionFallbackAttempts = Array.isArray(optionDataSource.fallbackAttempts)
    ? optionDataSource.fallbackAttempts
    : [];
  const optionSourceMessage = optionChain?.message || optionDataSource.error || '';
  const fieldHelpSections = fieldHelp
    ? FIELD_HELP_SECTIONS
      .map(([key, label]) => ({ key, label, text: fieldHelp[key] }))
      .filter((section) => section.text)
    : [];
  const showFieldHelp = (group, key) => {
    setFieldHelp({ group, key, ...getFieldHelp(group, key) });
  };

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
    const input = window.prompt(
      [
        `设置 ${option.contractSymbol} 期权提醒`,
        '输入格式：>1.50 表示高于等于提醒，<0.80 表示低于等于提醒',
      ].join('\n'),
      defaultTarget ? `>${defaultTarget}` : '>'
    );
    if (!input) return;
    const parsedAlert = parseOptionAlertInput(input, 'ABOVE');
    if (!parsedAlert) {
      Toast.show({ content: '请输入有效提醒，例如 >1.50 或 <0.80' });
      return;
    }
    await db.addPriceAlert({
      id: crypto.randomUUID(),
      symbol: normalizedSymbol,
      asset_id: option.contractSymbol,
      asset_type: 'OPTION',
      condition: parsedAlert.condition,
      target_price: parsedAlert.target,
      last_price: option.mark || option.last || null,
      channels: null,
      note: [
        `${option.expiration} ${option.type} ${option.strike}`,
        option.impliedVolatility ? `IV ${(option.impliedVolatility * 100).toFixed(2)}%` : '',
        Number.isFinite(Number(option.delta)) ? `Delta ${Number(option.delta).toFixed(2)}` : '',
      ].filter(Boolean).join(' · '),
    });
    await reloadAlerts();
    await syncCloudAlerts({ notificationConfig, marketDataConfig });
    Toast.show({
      icon: 'success',
      content: `期权提醒已添加：${parsedAlert.condition === 'ABOVE' ? '高于等于' : '低于等于'} ${parsedAlert.target}`,
    });
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

      <div className="stock-detail__tabs" role="tablist" aria-label="图表周期">
        {TABS.map(tab => (
          <button
            type="button"
            key={tab.id} 
            className={`stock-detail__tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="stock-detail__chart-container">
        {loading ? (
          <div className="chart-loading">正在加载专业图表...</div>
        ) : (
          <>
            <KlineChart data={chartData} interval={activeTab} />
            {chartError ? (
              <div className="stock-detail__chart-note">{chartError}</div>
            ) : null}
          </>
        )}
      </div>

      <div className="stock-detail__mode-switch">
        <button
          type="button"
          className={detailMode === 'stock' ? 'active' : ''}
          onClick={() => setDetailMode('stock')}
        >
          公司情报
        </button>
        <button
          type="button"
          className={detailMode === 'option' ? 'active' : ''}
          onClick={() => setDetailMode('option')}
        >
          期权链
        </button>
      </div>

      {detailMode === 'stock' && (
        <div className="stock-detail__company">
          <div className="stock-detail__company-overview">
            <div className="stock-detail__company-identity">
              <span className="stock-detail__eyebrow">Company Intelligence</span>
              <h3>{company.name || normalizedSymbol}</h3>
              <p>{displaySector} · {displayIndustry}</p>
              <div className="stock-detail__company-tags">
                <span>{companyExchangeLabel}</span>
                {company.financialPeriod && <span>{company.financialPeriod}</span>}
                {derivativeSupport.length > 0 && <span>{derivativeSupport.join(' / ')}</span>}
              </div>
            </div>
            <div className={`stock-detail__rank-panel stock-detail__rank-panel--${String(company.industryRank?.tier || 'd').toLowerCase()}`}>
              <div>
                <span>
                  {industryRankSourceLabel}
                  <button
                    type="button"
                    aria-label="查看行业排名解释"
                    onClick={() => showFieldHelp('stock', 'industryRank')}
                  >
                    ?
                  </button>
                </span>
                <strong>{industryRankValue}</strong>
              </div>
              <em>{company.industryRank?.label || '排名待估算'}</em>
            </div>
          </div>
          <div className="stock-detail__company-hero">
            <div className="stock-detail__company-hero-card stock-detail__company-hero-card--rank">
              <span>排名口径</span>
              <strong>{industryRankValue}</strong>
              <em>{industryRankNote}</em>
            </div>
            <div className="stock-detail__company-hero-card">
              <span>公司档案</span>
              <strong>{companyLocationLabel}</strong>
              <em>{companyAddressLabel} · {companyWebsiteLabel}</em>
            </div>
            <div className="stock-detail__company-hero-card">
              <span>评级 / 目标价</span>
              <strong>{formatAnalystRecommendation(companyRatings.recommendation)}</strong>
              <em>
                目标价 {analystTargetLabel}
                {companyRatings.analystCount ? ` · ${companyRatings.analystCount} 家机构` : ''}
              </em>
            </div>
            <div className="stock-detail__company-hero-card">
              <span>企业事件</span>
              <strong>{corporateEventCount ? `${corporateEventCount} 条` : '--'}</strong>
              <em>
                {[
                  companyDividends.length ? `分红 ${companyDividends.length}` : '',
                  companyCorpActions.length ? `行动 ${companyCorpActions.length}` : '',
                  companyFundHolders.length ? `基金 ${companyFundHolders.length}` : '',
                ].filter(Boolean).join(' · ') || '分红、回购、公司行动等待长桥返回'}
              </em>
            </div>
          </div>
          <div className="stock-detail__source-row">
            <span className="stock-detail__source-row-main">
              数据来源：{company.providers?.longbridge === 'ok' ? 'Longbridge 已增强' : 'Longbridge 未启用'} · {company.providers?.yahooProfile === 'ok' ? 'Yahoo Profile' : 'Yahoo fallback'}
              <button
                type="button"
                aria-label="查看画像来源解释"
                onClick={() => showFieldHelp('stock', 'dataSource')}
              >
                ?
              </button>
            </span>
            {company.classificationSource && (
              <span>行业分类：{company.classificationSource}</span>
            )}
          </div>
          <div className="stock-detail__profile-grid">
            {[
              ['marketCap', company.marketCap, 'money'],
              ['floatMarketCap', company.floatMarketCap, 'money'],
              ['enterpriseValue', company.enterpriseValue, 'money'],
              ['trailingPE', company.trailingPE, 'multiple'],
              ['forwardPE', company.forwardPE, 'multiple'],
              ['priceToBook', company.priceToBook, 'multiple'],
              ['priceToSales', company.priceToSales, 'multiple'],
              ['beta', company.beta, 'multiple'],
              ['epsTtm', company.epsTtm, 'money'],
              ['bps', company.bps, 'money'],
              ['revenueGrowth', company.revenueGrowth, 'ratioPercent'],
              ['profitMargins', company.profitMargins, 'ratioPercent'],
              ['returnOnEquity', company.returnOnEquity, 'ratioPercent'],
              ['netIncome', company.netIncome, 'money'],
              ['netIncomeGrowth', company.netIncomeGrowth, 'ratioPercent'],
              ['totalShares', company.totalShares, 'number'],
              ['circulatingShares', company.circulatingShares, 'number'],
              ['lotSize', company.lotSize, 'number'],
              ['freeCashflow', company.freeCashflow, 'money'],
              ['totalAssets', company.totalAssets, 'money'],
              ['totalLiabilities', company.totalLiabilities, 'money'],
              ['debtToAssets', company.debtToAssets, 'ratioPercent'],
              ['employees', company.employees, 'number'],
              ['listingDate', company.listingDate, 'text'],
              ['founded', company.founded, 'text'],
              ['website', company.website, 'url'],
            ].map(([key, value, type]) => {
              const help = getFieldHelp('stock', key);
              return (
                <div key={key} className="stock-detail__profile-metric">
                  <span>
                    {help.label}
                    <button
                      type="button"
                      aria-label={`查看${help.label}解释`}
                      onClick={() => showFieldHelp('stock', key)}
                    >
                      ?
                    </button>
                  </span>
                  <strong>{formatProfileValue(value, type)}</strong>
                </div>
              );
            })}
          </div>
          <div className="stock-detail__longbridge-coverage">
            <div>
              <strong>长桥数据覆盖</strong>
              <span>{longbridgeModuleSummary.loaded.length ? `已拿到 ${longbridgeModuleSummary.loaded.length} 个模块` : '暂无增强模块'}</span>
            </div>
            <div className="stock-detail__longbridge-coverage-tags">
              {longbridgeModuleSummary.loaded.slice(0, 10).map((label) => (
                <span key={label}>{label}</span>
              ))}
              {longbridgeModuleSummary.loaded.length > 10 && (
                <span>+{longbridgeModuleSummary.loaded.length - 10}</span>
              )}
              {!longbridgeModuleSummary.loaded.length && (
                <span>请检查长桥 Key / Token / 权限</span>
              )}
            </div>
            {longbridgeModuleSummary.failed.length > 0 && (
              <details className="stock-detail__longbridge-errors">
                <summary>有 {longbridgeModuleSummary.failed.length} 个模块未返回，点开看原因</summary>
                {longbridgeModuleSummary.failed.slice(0, 8).map((item) => (
                  <p key={item.key}>
                    <strong>{item.label}</strong>
                    <span>{item.message}</span>
                  </p>
                ))}
              </details>
            )}
          </div>
          {(company.valuationSummary || company.earningsSummary) && (
            <div className="stock-detail__longbridge-notes">
              {company.valuationSummary && (
                <div>
                  <span>
                    长桥估值解读
                    <button
                      type="button"
                      aria-label="查看估值解读解释"
                      onClick={() => showFieldHelp('stock', 'valuationSummary')}
                    >
                      ?
                    </button>
                  </span>
                  <p>{company.valuationSummary.replace(/<[^>]*>/g, '')}</p>
                </div>
              )}
              {company.earningsSummary && (
                <div>
                  <span>
                    长桥财报快照
                    <button
                      type="button"
                      aria-label="查看财报快照解释"
                      onClick={() => showFieldHelp('stock', 'earningsSummary')}
                    >
                      ?
                    </button>
                  </span>
                  <p>{company.earningsSummary}</p>
                </div>
              )}
            </div>
          )}
          <div className="stock-detail__intelligence-grid">
            <div className="stock-detail__intel-card">
              <span>机构评级 / 目标价</span>
              <strong>{formatAnalystRecommendation(companyRatings.recommendation)}</strong>
              <p>
                目标价 {formatProfileValue(companyRatings.targetPrice || company.targetPrice || company.targetMeanPrice, 'money')}
                {companyRatings.analystCount ? ` · ${companyRatings.analystCount} 家机构` : ''}
              </p>
              <em>
                买入 {ratingDistribution.buy ?? '--'} · 持有 {ratingDistribution.hold ?? '--'} · 卖出 {ratingDistribution.sell ?? '--'}
              </em>
            </div>
            <div className="stock-detail__intel-card">
              <span>EPS 预测 / 一致预期</span>
              <strong>{formatProfileValue(company.forecastEps?.mean || company.forecastEpsMean, 'money')}</strong>
              <p>
                区间 {formatProfileValue(company.forecastEps?.low, 'money')} - {formatProfileValue(company.forecastEps?.high, 'money')}
              </p>
              <em>
                {company.consensus?.period || '预测周期待返回'}
                {company.forecastEps?.institutionTotal ? ` · ${company.forecastEps.institutionTotal} 家机构` : ''}
              </em>
            </div>
            <div className="stock-detail__intel-card">
              <span>行业估值分布</span>
              <strong>PE {formatProfileValue(companyDistribution.pe?.current || company.trailingPE, 'multiple')}</strong>
              <p>
                行业中位 {formatProfileValue(companyDistribution.pe?.median, 'multiple')} · 排位 {companyDistribution.pe?.rankIndex || '--'}/{companyDistribution.pe?.rankTotal || '--'}
              </p>
              <em>PB {formatProfileValue(companyDistribution.pb?.current || company.priceToBook, 'multiple')} · PS {formatProfileValue(companyDistribution.ps?.current || company.priceToSales, 'multiple')}</em>
            </div>
          </div>
          {financialReportCards.length > 0 && (
            <div className="stock-detail__financial-deck">
              <div className="stock-detail__mini-table-head">
                <strong>长桥财务快照</strong>
                <span>{company.financialReports?.periods?.[0]?.label || company.financialPeriod || '最近披露期'}</span>
              </div>
              <div className="stock-detail__financial-cards">
                {financialReportCards.slice(0, 6).map((item) => (
                  <span key={item.key}>
                    <em>{item.label}</em>
                    <strong>{formatProfileValue(item.value, item.type || 'money')}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
          {financialReportSections.length > 0 && (
            <details className="stock-detail__financial-reports">
              <summary>
                <span>财务三表明细</span>
                <em>{financialReportSections.length} 个报表 · 点开查看</em>
              </summary>
              <div className="stock-detail__financial-report-grid">
                {financialReportSections.map(([key, report]) => (
                  <div key={key} className="stock-detail__financial-report">
                    <strong>{getFinancialReportTitle(key)}</strong>
                    {(report.rows || []).slice(0, 6).map((row) => (
                      <p key={`${key}-${row.field || row.name}`}>
                        <span>{row.name || row.field}</span>
                        <em>{formatProfileValue(row.value, row.percent ? 'ratioPercent' : 'money')}</em>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}
          {companyConsensusDetails.length > 0 && (
            <div className="stock-detail__mini-table">
              <div className="stock-detail__mini-table-head">
                <strong>业绩一致预期</strong>
                <span>{company.consensus?.period || company.consensus?.currency || ''}</span>
              </div>
              {companyConsensusDetails.slice(0, 5).map((item, index) => (
                <div className="stock-detail__mini-row" key={`${item.key || item.name || 'consensus'}-${index}`}>
                  <span>{item.name}</span>
                  <strong>{formatProfileValue(item.estimate, 'money')}</strong>
                  <em>{item.compDesc || (item.isReleased ? '已披露' : '待披露')}</em>
                </div>
              ))}
            </div>
          )}
          {companyOperating && (
            <div className="stock-detail__operating-card">
              <div>
                <span>经营摘要</span>
                <strong>{companyOperating.title || companyOperating.report || '最新经营数据'}</strong>
              </div>
              {companyOperating.summary && <p>{companyOperating.summary}</p>}
              {companyOperating.indicators?.length > 0 && (
                <div className="stock-detail__operating-indicators">
                  {companyOperating.indicators.slice(0, 6).map((item, index) => (
                    <span key={`${item.key || item.name || 'operating'}-${index}`}>
                      <em>{item.name}</em>
                      <strong>{item.value || '--'}</strong>
                      {item.yoy && <small>{item.yoy}</small>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {(companyDividends.length > 0 || companyCorpActions.length > 0 || hasBuybackTtm || companyInvestRelations.length > 0) && (
            <div className="stock-detail__corporate-grid">
              {companyDividends.length > 0 && (
                <div className="stock-detail__corporate-card">
                  <strong>分红日历</strong>
                  {companyDividends.slice(0, 3).map((item, index) => (
                    <p key={`${item.id || `${item.exDate}-${item.paymentDate}` || 'dividend'}-${index}`}>
                      <span>{item.desc || '分红事件'}</span>
                      <em>{item.exDate || item.paymentDate || item.recordDate || '--'}</em>
                    </p>
                  ))}
                </div>
              )}
              {hasBuybackTtm && (
                <div className="stock-detail__corporate-card stock-detail__corporate-card--accent">
                  <strong>回购强度</strong>
                  <p>
                    <span>TTM 净回购</span>
                    <em>{formatProfileValue(companyBuyback.recent.netBuybackTtm, 'money')}</em>
                  </p>
                  <p>
                    <span>回购收益率</span>
                    <em>{formatOptionalRatio(companyBuyback.recent.netBuybackYieldTtm)}</em>
                  </p>
                </div>
              )}
              {companyCorpActions.length > 0 && (
                <div className="stock-detail__corporate-card">
                  <strong>公司行动</strong>
                  {companyCorpActions.slice(0, 4).map((item, index) => (
                    <p key={item.id || `${item.date}-${index}`}>
                      <span>{item.desc || item.type || '事件'}</span>
                      <em>{formatCompanyActionDate(item)}</em>
                    </p>
                  ))}
                </div>
              )}
              {companyInvestRelations.length > 0 && (
                <div className="stock-detail__corporate-card">
                  <strong>投资关系</strong>
                  {companyInvestRelations.slice(0, 4).map((item, index) => (
                    <p key={`${item.symbol || item.name || 'invest-relation'}-${index}`}>
                      <span>{item.name || item.symbol}</span>
                      <em>{formatOptionalRatio(item.percent)}</em>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {(companyShareholders.length > 0 || companyFundHolders.length > 0 || companyExecutives.length > 0 || companyPeerItems.length > 0 || companyValuationPeers.length > 0) && (
            <div className="stock-detail__entity-panels">
              {companyShareholders.length > 0 && (
                <section className="stock-detail__entity-card stock-detail__entity-card--wide">
                  <div className="stock-detail__entity-card-head">
                    <strong>主要股东</strong>
                    <span>{company.shareholders?.total ? `${company.shareholders.total} 条` : 'Top holders'}</span>
                  </div>
                  {companyShareholders.slice(0, 4).map((item, index) => (
                    <div className="stock-detail__entity-row" key={`${item.name}-${index}`}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.type || item.reportDate || '长桥股东数据'}</small>
                      </span>
                      <em>{formatOptionalRatio(item.percent)}</em>
                    </div>
                  ))}
                </section>
              )}
              {companyFundHolders.length > 0 && (
                <section className="stock-detail__entity-card stock-detail__entity-card--wide">
                  <div className="stock-detail__entity-card-head">
                    <strong>基金 / ETF 持仓</strong>
                    <span>{company.fundHolders?.total ? `${company.fundHolders.total} 只` : 'Fund holders'}</span>
                  </div>
                  {companyFundHolders.slice(0, 4).map((item, index) => (
                    <div className="stock-detail__entity-row" key={`${item.symbol || item.name || 'fund-holder'}-${index}`}>
                      <span>
                        <strong>{item.name || item.symbol}</strong>
                        <small>{[item.symbol, item.reportDate].filter(Boolean).join(' · ') || '长桥基金持仓'}</small>
                      </span>
                      <em>{formatOptionalRatio(item.positionRatio)}</em>
                    </div>
                  ))}
                </section>
              )}
              {companyExecutives.length > 0 && (
                <section className="stock-detail__entity-card stock-detail__entity-card--full">
                  <div className="stock-detail__entity-card-head">
                    <strong>管理层</strong>
                    <span>{company.executives?.total ? `${company.executives.total} 人` : 'Leadership'}</span>
                  </div>
                  {companyExecutives.slice(0, 4).map((item, index) => (
                    <div className="stock-detail__leader-row" key={`${item.name}-${index}`}>
                      <strong>{item.name}</strong>
                      <span>{item.title || '--'}</span>
                    </div>
                  ))}
                </section>
              )}
              {(companyValuationPeers.length > 0 || companyPeerItems.length > 0) && (
                <section className="stock-detail__entity-card stock-detail__entity-card--full">
                  <div className="stock-detail__entity-card-head">
                    <strong>同业估值</strong>
                    <span>{(companyValuationPeers.length || companyPeerItems.length)} 个对照</span>
                  </div>
                  {(companyValuationPeers.length ? companyValuationPeers : companyPeerItems).slice(0, 4).map((item, index) => (
                    <div className="stock-detail__peer-row" key={`${item.symbol || item.name || 'peer'}-${index}`}>
                      <span>
                        <strong>{item.symbol || item.name}</strong>
                        <small>{item.name || item.currency || 'Peer'}</small>
                      </span>
                      <em>PE {formatProfileValue(item.pe, 'multiple')}</em>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
          {company.businessSummary ? (
            <div className="stock-detail__business-summary">
              <h4>
                公司业务简介
                <button
                  type="button"
                  aria-label="查看业务简介解释"
                  onClick={() => showFieldHelp('stock', 'businessSummary')}
                >
                  ?
                </button>
              </h4>
              <p>{company.businessSummary}</p>
            </div>
          ) : (
            <div className="stock-detail__business-summary stock-detail__business-summary--empty">
              公司画像接口暂时不可用，当前先展示价格、K 线和技术证据；稍后会自动重试。
            </div>
          )}
        </div>
      )}

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
            {activeAlerts.map((alert) => {
              const alertLabel = formatAlertAssetLabel(alert);
              return (
                <div
                  key={alert.id}
                  className={`stock-detail__alert-item stock-detail__alert-item--${String(alert.asset_type || 'STOCK').toLowerCase()}`}
                >
                  <div className="stock-detail__alert-asset">
                    <span>{alertLabel.title}</span>
                    <em>{alertLabel.subtitle}</em>
                  </div>
                  <span className="stock-detail__alert-type">{alertLabel.badge}</span>
                  <strong>{alert.condition === 'ABOVE' ? '≥' : '≤'} {Number(alert.target_price).toFixed(2)}</strong>
                  <div className="stock-detail__alert-actions">
                    <button type="button" onClick={() => handleEditAlert(alert)}>修改</button>
                    <button type="button" onClick={() => handleDeleteAlert(alert)}>删除</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="stock-detail__alert-empty">暂无活动提醒</div>
        )}
      </div>

      {detailMode === 'option' && (
      <div className="stock-detail__options">
        <div className="stock-detail__module-header">
          <div>
            <h3>期权链</h3>
            <p>{optionProvider} · Bid / Ask / Mid / IV / Greeks</p>
          </div>
          {optionLoading && <span className="stock-detail__module-loading">加载中</span>}
        </div>
        <div className={`stock-detail__options-source stock-detail__options-source--${optionSourceTone}`}>
          <button
            type="button"
            className="stock-detail__options-source-toggle"
            aria-expanded={optionSourceExpanded}
            onClick={() => setOptionSourceExpanded((value) => !value)}
          >
            <strong>{optionSourceLabel}</strong>
            <span>
              {optionCount ? `${optionCount} 个合约` : '合约数待返回'}
              {optionUpdatedAt ? ` · 报价 ${formatQuoteTimestamp(optionUpdatedAt)}` : ''}
            </span>
            <em>{optionSourceExpanded ? '收起' : '详情'}</em>
          </button>
          {optionSourceExpanded && (
            <>
              <div className="stock-detail__options-source-main">
                <span>{optionDataNote}</span>
                {optionDataSource.fallbackNote && <span>{optionDataSource.fallbackNote}</span>}
                {optionSourceMessage && <span>{optionSourceMessage}</span>}
              </div>
              <div className="stock-detail__options-source-tags">
                <span>{hasOptionSpotPrice ? `按现价 $${optionSpotPrice.toFixed(2)} 附近排序` : '未拿到正股现价，按行权价排序'}</span>
                <span>{optionChain?.expirations?.length ? `${optionChain.expirations.length} 个到期日` : '到期日待返回'}</span>
                {optionUpdatedAt && <span>报价 {formatQuoteTimestamp(optionUpdatedAt)}</span>}
                {optionGeneratedAt && <span>接口 {optionGeneratedAt}</span>}
              </div>
              {optionFallbackAttempts.length > 0 && (
                <div className="stock-detail__options-source-attempts">
                  {optionFallbackAttempts.map((attempt) => (
                    <span key={`${attempt.provider}-${attempt.message}`}>
                      <strong>{attempt.provider}</strong>
                      <em>{attempt.message}</em>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="stock-detail__options-controls">
          <div className="stock-detail__expiration-picker" aria-label="选择期权到期日">
            {(optionChain?.expirations || []).slice(0, optionSourceExpanded ? 40 : 8).map((expiration) => (
              <button
                type="button"
                key={expiration}
                className={effectiveOptionExpiration === expiration ? 'active' : ''}
                onClick={() => setOptionExpiration(expiration)}
              >
                {expiration.slice(5)}
              </button>
            ))}
            {(optionChain?.expirations || []).length > 8 && (
              <button
                type="button"
                className="stock-detail__expiration-picker-more"
                onClick={() => setOptionSourceExpanded((value) => !value)}
              >
                {optionSourceExpanded ? '收起' : `+${optionChain.expirations.length - 8}`}
              </button>
            )}
          </div>
          <select
            value={optionTypeFilter}
            onChange={(e) => setOptionTypeFilter(e.target.value)}
          >
            <option value="ALL">全部</option>
            <option value="CALL">Call</option>
            <option value="PUT">Put</option>
          </select>
        </div>
        {nearAtmOptions.length > 0 ? (
          <div className="stock-detail__options-table">
            <div className="stock-detail__options-head">
              <span>
                合约
                <button
                  type="button"
                  aria-label="查看合约解释"
                  onClick={() => showFieldHelp('option', 'contract')}
                >
                  ?
                </button>
              </span>
              <em>按接近现价排序 · 点击卡片添加价格提醒</em>
            </div>
            {nearAtmOptions.map((option) => (
              <button
                type="button"
                key={option.contractSymbol}
                className={`stock-detail__option-row stock-detail__option-row--${String(option.type || '').toLowerCase()}`}
                onClick={() => handleAddOptionAlert(option)}
              >
                <div className="stock-detail__option-card-head">
                  <span>
                    <strong>{option.underlying || normalizedSymbol} {formatOptionStrike(option.strike)}{option.type === 'PUT' ? 'P' : 'C'}</strong>
                    <em>{option.expiration ? `EXP ${option.expiration.slice(5)}` : option.type}</em>
                  </span>
                  <span className={`stock-detail__option-moneyness stock-detail__option-moneyness--${option.money?.tone || 'unknown'}`}>
                    {option.money?.label || option.money?.status || '--'}
                  </span>
                </div>
                <div className="stock-detail__option-card-grid">
                  {OPTION_FIELD_COLUMNS.map(({ key, label }) => {
                    const value = {
                      expiration: formatOptionExpirationDte(option.expiration),
                      bidAsk: `${formatMetric(option.bid)} / ${formatMetric(option.ask)}`,
                      mark: formatMetric(option.mark),
                      last: formatMetric(option.last),
                      previousClose: formatMetric(option.previousClose),
                      dayChange: formatOptionDayChange(option),
                      impliedVolatility: formatMetric(option.impliedVolatility ? option.impliedVolatility * 100 : null, '%'),
                      delta: formatMetric(option.delta),
                      gamma: formatMetric(option.gamma),
                      theta: formatMetric(option.theta),
                      vega: formatMetric(option.vega),
                      volume: formatCompact(option.volume),
                      openInterest: formatCompact(option.openInterest),
                      intrinsicValue: formatMetric(option.intrinsicValue),
                      extrinsicValue: formatMetric(option.extrinsicValue),
                      moneyness: option.money?.label || option.money?.status || '--',
                    }[key];
                    const numberValue = key === 'dayChange' ? Number(option.change) : null;
                    const tone = key === 'dayChange' && Number.isFinite(numberValue)
                      ? (numberValue > 0 ? 'positive' : (numberValue < 0 ? 'negative' : 'flat'))
                      : '';

                    return (
                      <span key={key} className={`stock-detail__option-field stock-detail__option-field--${key} ${tone ? `stock-detail__option-field--${tone}` : ''}`}>
                        <em>
                          {label}
                          <button
                            type="button"
                            aria-label={`查看${label}解释`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              showFieldHelp('option', key);
                            }}
                          >
                            ?
                          </button>
                        </em>
                        <strong>{value}</strong>
                      </span>
                    );
                  })}
                </div>
              </button>
            ))}
            <div className="stock-detail__options-hint">
              点击合约可添加期权价格提醒，输入 <strong>&gt;1.50</strong> 或 <strong>&lt;0.80</strong> 即可决定高于/低于触发。
            </div>
          </div>
        ) : (
          <div className="stock-detail__alert-empty">
            {optionLoading ? '正在加载期权链...' : (optionChain?.message || '暂无可用期权链数据')}
          </div>
        )}
      </div>
      )}

      {fieldHelp && (
        <div className="stock-detail__field-help-mask" onClick={() => setFieldHelp(null)}>
          <div
            className="stock-detail__field-help"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-detail-field-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="stock-detail__field-help-bar" aria-hidden="true" />
            <div className="stock-detail__field-help-header">
              <span>{fieldHelp.group === 'option' ? '期权字段解释' : '股票字段解释'}</span>
              <button type="button" onClick={() => setFieldHelp(null)} aria-label="关闭字段解释">关闭</button>
            </div>
            <div className="stock-detail__field-help-hero">
              <small>{fieldHelp.group === 'option' ? '期权看盘字段' : '公司画像字段'}</small>
              <h3 id="stock-detail-field-help-title">{fieldHelp.label}</h3>
              <p>{fieldHelp.detail}</p>
            </div>
            {fieldHelpSections.length > 0 && (
              <div className="stock-detail__field-help-sections">
                {fieldHelpSections.map((section) => (
                  <section key={section.key}>
                    <span>{section.label}</span>
                    <p>{section.text}</p>
                  </section>
                ))}
              </div>
            )}
            <div className="stock-detail__field-help-footnote">
              {fieldHelp.group === 'option'
                ? '复盘时不要只看一个字段：价格、DTE、IV、Greeks 和流动性要一起判断。'
                : '公司画像用于辅助判断，不替代财报原文和交易计划。'}
            </div>
          </div>
        </div>
      )}

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
