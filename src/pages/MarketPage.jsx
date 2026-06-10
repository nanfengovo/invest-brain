import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Toast } from 'antd-mobile';
import { useAppStore } from '../stores/useAppStore';
import { useTradeStore } from '../stores/useTradeStore';
import MarketHeader from '../components/Market/MarketHeader';
import IndexCardScroller from '../components/Market/IndexCardScroller';
import OptionMonitorStrip from '../components/Market/OptionMonitorStrip';
import SectorGrid from '../components/Market/SectorGrid';
import WatchlistBoard from '../components/Market/WatchlistBoard';
import { findMatchingOption, getOptionCandidates, mergeOptionQuote } from '../utils/optionsMarket';
import { getMarketRegion } from '../utils/marketSymbols';
import { sharePoster } from '../utils/sharePoster';
import './MarketPage.css';

const SHARE_BASE_URL = 'https://invest-brain.vercel.app';
const MARKET_DATA_CACHE_KEY = 'ib_market_page_cache';
const MARKET_REGION_KEY = 'ib_market_active_region';
const MARKET_CLIENT_CACHE_TTL_MS = 30_000;
const MARKET_POLL_INTERVAL_MS = 8_000;
const MARKET_FLASH_MS = 1_100;

const MARKET_REGIONS = {
  US: {
    label: '美股',
    subtitle: '热门美股实时股价',
    spotlightLabel: '热门美股',
    sectorTitle: '美股夜盘',
    shareHint: '默认美股',
    stocks: [
      { symbol: 'NVDA', name: '英伟达', quoteLabel: '美股 · NVDA' },
      { symbol: 'AAPL', name: '苹果', quoteLabel: '美股 · AAPL' },
      { symbol: 'MSFT', name: '微软', quoteLabel: '美股 · MSFT' },
      { symbol: 'GOOGL', name: 'Alphabet', quoteLabel: '美股 · GOOGL' },
      { symbol: 'AMZN', name: '亚马逊', quoteLabel: '美股 · AMZN' },
      { symbol: 'META', name: 'Meta', quoteLabel: '美股 · META' },
      { symbol: 'TSLA', name: '特斯拉', quoteLabel: '美股 · TSLA' },
      { symbol: 'AMD', name: 'AMD', quoteLabel: '美股 · AMD' },
      { symbol: 'AVGO', name: '博通', quoteLabel: '美股 · AVGO' },
      { symbol: 'SMCI', name: '超微电脑', quoteLabel: '美股 · SMCI' },
      { symbol: 'PLTR', name: 'Palantir', quoteLabel: '美股 · PLTR' },
      { symbol: 'COIN', name: 'Coinbase', quoteLabel: '美股 · COIN' },
      { symbol: 'MSTR', name: '微策略', quoteLabel: '美股 · MSTR' },
      { symbol: 'NFLX', name: '奈飞', quoteLabel: '美股 · NFLX' },
      { symbol: 'ORCL', name: '甲骨文', quoteLabel: '美股 · ORCL' },
      { symbol: 'TSM', name: '台积电ADR', quoteLabel: '美股 · TSM' },
    ],
    sectors: [
      { symbol: 'gb_xbi', name: '创新药', icon: '💊' },
      { symbol: 'gb_xlu', name: '电网', icon: '⚡' },
      { symbol: 'gb_xop', name: '油气开采', icon: '🛢️' },
      { symbol: 'gb_xle', name: '能源', icon: '🔌' },
      { symbol: 'gb_moo', name: '农业', icon: '🌾' },
      { symbol: 'gb_uso', name: '原油', icon: '🛢' },
      { symbol: 'gb_ita', name: '商业航天', icon: '🚀' },
      { symbol: 'gb_soxx', name: '芯片', icon: '💽' },
      { symbol: 'gb_botz', name: 'AIGC', icon: 'AI' },
      { symbol: 'gb_robo', name: '机器人', icon: '🤖' },
      { symbol: 'gb_xme', name: '有色', icon: '🧱' },
      { symbol: 'gb_icln', name: '新能源', icon: '🍃' },
      { symbol: 'gb_lit', name: '锂电池', icon: '🔋' },
      { symbol: 'gb_kol', name: '煤炭', icon: '🪨' },
      { symbol: 'gb_xlk', name: '数据中心', icon: '🏢' },
      { symbol: 'gb_smh', name: '半导体', icon: '📟' },
      { symbol: 'gb_ita', name: '军工', icon: '🪖' },
      { symbol: 'gb_tan', name: '光伏', icon: '☀️' },
      { symbol: 'gb_xlc', name: 'CPO', icon: '💡' },
      { symbol: 'gb_ufos', name: '卫星', icon: '🛰' },
    ],
  },
  CN: {
    label: 'A股',
    subtitle: 'A股核心资产与主题 ETF',
    spotlightLabel: 'A股核心',
    sectorTitle: 'A股主题',
    shareHint: '默认A股',
    stocks: [
      { symbol: '600519.SS', name: '贵州茅台', quoteLabel: 'A股 · 600519.SH' },
      { symbol: '300750.SZ', name: '宁德时代', quoteLabel: 'A股 · 300750.SZ' },
      { symbol: '000001.SZ', name: '平安银行', quoteLabel: 'A股 · 000001.SZ' },
      { symbol: '601318.SS', name: '中国平安', quoteLabel: 'A股 · 601318.SH' },
      { symbol: '002594.SZ', name: '比亚迪', quoteLabel: 'A股 · 002594.SZ' },
      { symbol: '600036.SS', name: '招商银行', quoteLabel: 'A股 · 600036.SH' },
      { symbol: '601012.SS', name: '隆基绿能', quoteLabel: 'A股 · 601012.SH' },
      { symbol: '600900.SS', name: '长江电力', quoteLabel: 'A股 · 600900.SH' },
      { symbol: '600276.SS', name: '恒瑞医药', quoteLabel: 'A股 · 600276.SH' },
      { symbol: '000333.SZ', name: '美的集团', quoteLabel: 'A股 · 000333.SZ' },
      { symbol: '002415.SZ', name: '海康威视', quoteLabel: 'A股 · 002415.SZ' },
      { symbol: '601888.SS', name: '中国中免', quoteLabel: 'A股 · 601888.SH' },
    ],
    sectors: [
      { symbol: '510300.SS', name: '沪深300', icon: '🇨🇳' },
      { symbol: '510500.SS', name: '中证500', icon: '📈' },
      { symbol: '512480.SS', name: '半导体', icon: '💽' },
      { symbol: '512010.SS', name: '医药', icon: '💊' },
      { symbol: '515790.SS', name: '光伏', icon: '☀️' },
      { symbol: '516160.SS', name: '新能源', icon: '🍃' },
      { symbol: '512800.SS', name: '银行', icon: '🏦' },
      { symbol: '512660.SS', name: '军工', icon: '🪖' },
      { symbol: '159995.SZ', name: '芯片', icon: '📟' },
      { symbol: '159928.SZ', name: '消费', icon: '🛒' },
      { symbol: '601318.SS', name: '中国平安', icon: '🛡️' },
      { symbol: '002594.SZ', name: '比亚迪', icon: '🚗' },
    ],
  },
  HK: {
    label: '港股',
    subtitle: '港股核心资产与恒生科技',
    spotlightLabel: '港股核心',
    sectorTitle: '港股主题',
    shareHint: '默认港股',
    stocks: [
      { symbol: '0700.HK', name: '腾讯控股', quoteLabel: '港股 · 0700.HK' },
      { symbol: '9988.HK', name: '阿里巴巴-W', quoteLabel: '港股 · 9988.HK' },
      { symbol: '3690.HK', name: '美团-W', quoteLabel: '港股 · 3690.HK' },
      { symbol: '1810.HK', name: '小米集团-W', quoteLabel: '港股 · 1810.HK' },
      { symbol: '9618.HK', name: '京东集团-SW', quoteLabel: '港股 · 9618.HK' },
      { symbol: '1299.HK', name: '友邦保险', quoteLabel: '港股 · 1299.HK' },
      { symbol: '0005.HK', name: '汇丰控股', quoteLabel: '港股 · 0005.HK' },
      { symbol: '0388.HK', name: '香港交易所', quoteLabel: '港股 · 0388.HK' },
      { symbol: '0981.HK', name: '中芯国际', quoteLabel: '港股 · 0981.HK' },
      { symbol: '1024.HK', name: '快手-W', quoteLabel: '港股 · 1024.HK' },
      { symbol: '9999.HK', name: '网易-S', quoteLabel: '港股 · 9999.HK' },
      { symbol: '2318.HK', name: '中国平安', quoteLabel: '港股 · 2318.HK' },
    ],
    sectors: [
      { symbol: '2800.HK', name: '盈富基金', icon: '🇭🇰' },
      { symbol: '3033.HK', name: '恒生科技', icon: '💻' },
      { symbol: '2828.HK', name: '国企指数', icon: '🏢' },
      { symbol: '0700.HK', name: '腾讯', icon: '🎮' },
      { symbol: '9988.HK', name: '阿里', icon: '🛒' },
      { symbol: '3690.HK', name: '美团', icon: '🛵' },
      { symbol: '1810.HK', name: '小米', icon: '📱' },
      { symbol: '9618.HK', name: '京东', icon: '📦' },
      { symbol: '1299.HK', name: '友邦', icon: '🛡️' },
      { symbol: '0005.HK', name: '汇丰', icon: '🏦' },
      { symbol: '0388.HK', name: '港交所', icon: '💱' },
      { symbol: '0981.HK', name: '中芯国际', icon: '💽' },
    ],
  },
};

const parseMarketNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
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

const getUniqueSymbols = (symbols) => Array.from(new Set(symbols.filter(Boolean)));

const getSupportedMarketRegion = (region, fallback = 'US') => {
  const normalized = String(region || '').trim().toUpperCase();
  return MARKET_REGIONS[normalized] ? normalized : fallback;
};

const getMovementPrice = (quote) => {
  if (!quote) return null;
  return parseMarketNumber(quote.extendedMarket?.price ?? quote.displayPrice ?? quote.price);
};

const normalizeExtendedMarket = (extendedMarket) => {
  if (!extendedMarket?.price) return null;

  const price = parseMarketNumber(extendedMarket.price);
  if (price === null) return null;

  return {
    session: extendedMarket.session || '',
    label: extendedMarket.label || '',
    price,
    pctChange: parseMarketNumber(extendedMarket.pctChange),
    absChange: parseMarketNumber(extendedMarket.absChange),
  };
};

const readCachedMarketData = () => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.sessionStorage.getItem(MARKET_DATA_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - parsed.fetchedAt > MARKET_CLIENT_CACHE_TTL_MS) {
      return {};
    }

    return parsed.data;
  } catch {
    return {};
  }
};

const writeCachedMarketData = (data) => {
  try {
    window.sessionStorage.setItem(MARKET_DATA_CACHE_KEY, JSON.stringify({
      fetchedAt: Date.now(),
      data,
    }));
  } catch {
    // Session cache is only a perceived-speed optimization.
  }
};

const readActiveMarketRegion = () => {
  if (typeof window === 'undefined') return 'US';
  try {
    const params = new URLSearchParams(window.location.search);
    const urlRegion = getSupportedMarketRegion(params.get('region') || params.get('marketRegion'), '');
    if (urlRegion) return urlRegion;

    const saved = window.localStorage.getItem(MARKET_REGION_KEY);
    return getSupportedMarketRegion(saved);
  } catch {
    return 'US';
  }
};

const saveActiveMarketRegion = (region) => {
  try {
    window.localStorage.setItem(MARKET_REGION_KEY, region);
  } catch {
    // Region preference is cosmetic; the current session state still works.
  }
};

const buildMarketDataHeaders = (marketDataConfig = {}) => ({
  ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
  ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
  ...(marketDataConfig.marketDataToken ? { 'X-MarketData-Token': marketDataConfig.marketDataToken } : {}),
  ...(marketDataConfig.longbridgeAppKey ? { 'X-Longbridge-App-Key': marketDataConfig.longbridgeAppKey } : {}),
  ...(marketDataConfig.longbridgeAppSecret ? { 'X-Longbridge-App-Secret': marketDataConfig.longbridgeAppSecret } : {}),
  ...(marketDataConfig.longbridgeAccessToken ? { 'X-Longbridge-Access-Token': marketDataConfig.longbridgeAccessToken } : {}),
  ...(marketDataConfig.longbridgeBridgeUrl ? { 'X-Longbridge-Bridge-Url': marketDataConfig.longbridgeBridgeUrl } : {}),
  ...(marketDataConfig.longbridgeBridgeToken ? { 'X-Longbridge-Bridge-Token': marketDataConfig.longbridgeBridgeToken } : {}),
});

export default function MarketPage() {
  const {
    colorConvention,
    marketWatchlist,
    addMarketWatchItem,
    removeMarketWatchItem,
    marketDataConfig,
  } = useAppStore();
  const trades = useTradeStore((state) => state.trades);
  const [marketData, setMarketData] = useState(() => readCachedMarketData());
  const [optionQuotes, setOptionQuotes] = useState({});
  const [optionLoading, setOptionLoading] = useState(false);
  const [loading, setLoading] = useState(() => Object.keys(readCachedMarketData()).length === 0);
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [movementMap, setMovementMap] = useState({});
  const [activeRegion, setActiveRegion] = useState(readActiveMarketRegion);
  const priceMemoryRef = useRef({});
  const flashTimersRef = useRef({});
  const regionConfig = MARKET_REGIONS[activeRegion] || MARKET_REGIONS.US;
  const regionWatchlist = useMemo(
    () => marketWatchlist.filter((item) => (item.region || getMarketRegion(item.symbol)) === activeRegion),
    [activeRegion, marketWatchlist]
  );

  const optionCandidates = useMemo(() => getOptionCandidates({
    watchlist: activeRegion === 'US' ? marketWatchlist : [],
    trades,
    limit: 3,
  }), [activeRegion, marketWatchlist, trades]);
  const optionUnderlyingSymbols = useMemo(
    () => getUniqueSymbols(optionCandidates.map(item => item.underlying)),
    [optionCandidates]
  );

  const triggerMovement = (symbol, direction) => {
    if (!symbol || !direction) return;

    clearTimeout(flashTimersRef.current[symbol]);
    setMovementMap((prev) => ({
      ...prev,
      [symbol]: direction,
    }));

    flashTimersRef.current[symbol] = setTimeout(() => {
      setMovementMap((prev) => {
        if (prev[symbol] !== direction) return prev;
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
      delete flashTimersRef.current[symbol];
    }, MARKET_FLASH_MS);
  };

  useEffect(() => {
    return () => {
      Object.values(flashTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let activeController = null;
    const hasRegionWatchlist = regionWatchlist.length > 0;
    const primaryConfigs = hasRegionWatchlist ? regionWatchlist : regionConfig.stocks;
    const primarySymbols = getUniqueSymbols(primaryConfigs.map(item => item.symbol));
    const secondarySymbols = getUniqueSymbols([
      ...regionConfig.sectors.map(s => s.symbol),
      ...regionWatchlist.map(item => item.symbol),
      ...optionUnderlyingSymbols,
    ]).filter((symbol) => !primarySymbols.includes(symbol));

    const mergeMarketData = (nextData) => {
      if (!mounted || !nextData || Object.keys(nextData).length === 0) return;

      setMarketData((prevData) => {
        Object.entries(nextData).forEach(([symbol, quote]) => {
          const nextPrice = getMovementPrice(quote);
          const previousPrice = priceMemoryRef.current[symbol] ?? getMovementPrice(prevData[symbol]);

          if (
            Number.isFinite(nextPrice)
            && Number.isFinite(previousPrice)
            && nextPrice !== previousPrice
          ) {
            triggerMovement(symbol, nextPrice > previousPrice ? 'up' : 'down');
          }

          if (Number.isFinite(nextPrice)) {
            priceMemoryRef.current[symbol] = nextPrice;
          }
        });

        const merged = {
          ...prevData,
          ...nextData,
        };
        writeCachedMarketData(merged);
        return merged;
      });
    };

    const fetchSymbolGroup = async (symbols, signal, { extended = false } = {}) => {
      if (!symbols.length) return { data: {}, errors: {}, meta: {} };

      const symbolParam = symbols.join(',');
      const params = new URLSearchParams({ symbols: symbolParam });
      if (extended) params.set('extended', '1');

      const res = await fetch(`/api/market?${params.toString()}`, {
        signal,
        headers: buildMarketDataHeaders(marketDataConfig),
      });
      if (!res.ok) throw new Error('行情接口暂不可用');

      const json = await res.json();
      if (!json.success) return { data: {}, errors: json.errors || {}, meta: json.meta || {} };

      return {
        data: json.data || {},
        errors: json.errors || {},
        meta: json.meta || {},
      };
    };

    const fetchMarketData = async (isInitial = false) => {
      activeController?.abort();
      activeController = new AbortController();
      const { signal } = activeController;
      if (mounted) setMarketRefreshing(true);

      const primaryRequest = fetchSymbolGroup(primarySymbols, signal, { extended: activeRegion === 'US' && hasRegionWatchlist });
      const secondaryRequest = fetchSymbolGroup(secondarySymbols, signal);

      try {
        const primaryResult = await primaryRequest;
        mergeMarketData(primaryResult.data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch primary market data:', err);
        }
      } finally {
        if (mounted && isInitial) setLoading(false);
      }

      try {
        const secondaryResult = await secondaryRequest;
        mergeMarketData(secondaryResult.data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch secondary market data:', err);
        }
      } finally {
        if (mounted) setLoading(false);
        if (mounted) setMarketRefreshing(false);
      }
    };

    fetchMarketData(true);
    
    const intervalId = setInterval(() => fetchMarketData(false), MARKET_POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      activeController?.abort();
      clearInterval(intervalId);
    };
  }, [activeRegion, optionUnderlyingSymbols, regionConfig, regionWatchlist, marketDataConfig]);

  useEffect(() => {
    let mounted = true;
    let activeController = null;

    const fetchOptionQuotes = async () => {
      if (optionCandidates.length === 0) {
        setOptionQuotes({});
        setOptionLoading(false);
        return;
      }

      activeController?.abort();
      activeController = new AbortController();
      setOptionLoading(true);

      try {
        const nextQuotes = {};

        await Promise.all(optionCandidates.map(async (candidate) => {
          const params = new URLSearchParams({
            symbol: candidate.underlying,
            expiration: candidate.expiration,
            provider: marketDataConfig.optionProvider || 'auto',
          });
          if (candidate.contractSymbol) params.set('contract', candidate.contractSymbol);
          if (candidate.strike) params.set('strike', candidate.strike);
          if (candidate.optionType) params.set('side', candidate.optionType.toLowerCase());
          const res = await fetch(`/api/options-chain?${params.toString()}`, {
            signal: activeController.signal,
            headers: buildMarketDataHeaders(marketDataConfig),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || '期权行情加载失败');

          const match = findMatchingOption(json.options || [], candidate);
          if (match) {
            nextQuotes[candidate.id] = mergeOptionQuote(candidate, match);
          }
        }));

        if (!mounted) return;
        setOptionQuotes(nextQuotes);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn('Failed to fetch option quotes:', error);
        }
      } finally {
        if (mounted) setOptionLoading(false);
      }
    };

    fetchOptionQuotes();
    const intervalId = setInterval(fetchOptionQuotes, MARKET_POLL_INTERVAL_MS * 3);

    return () => {
      mounted = false;
      activeController?.abort();
      clearInterval(intervalId);
    };
  }, [optionCandidates, marketDataConfig]);

  // Map symbols to full data objects
  const mapData = (configList) => {
    return configList.map(config => {
      const data = marketData[config.symbol] || {};
      const extendedMarket = normalizeExtendedMarket(data.extendedMarket);
      return {
        ...config,
        name: config.name || data.name,
        quoteLabel: config.quoteLabel || data.yahooSymbol || data.instrumentType || '',
        price: parseMarketNumber(data.price),
        pctChange: parseMarketNumber(data.pctChange),
        absChange: parseMarketNumber(data.absChange),
        prevClose: parseMarketNumber(data.prevClose),
        extendedMarket,
        movement: movementMap[config.symbol] || '',
      };
    });
  };

  const hasRegionWatchlist = regionWatchlist.length > 0;
  const primaryItems = mapData(hasRegionWatchlist ? regionWatchlist : regionConfig.stocks);
  const optionItems = optionCandidates.map((candidate) => ({
    ...candidate,
    ...(optionQuotes[candidate.id] || {}),
    price: optionQuotes[candidate.id]?.price ?? null,
    pctChange: optionQuotes[candidate.id]?.pctChange ?? null,
    absChange: optionQuotes[candidate.id]?.absChange ?? null,
    quoteLabel: optionQuotes[candidate.id]?.quoteLabel || `${candidate.underlying} · ${candidate.expiration.slice(5)} · ${candidate.optionType}`,
    movement: movementMap[candidate.id] || '',
  }));
  const sectorItems = mapData(regionConfig.sectors);
  const watchlistItems = regionWatchlist.map((item) => {
    const data = marketData[item.symbol] || {};
    const extendedMarket = normalizeExtendedMarket(data.extendedMarket);
    return {
      ...item,
      name: data.name || item.name,
      price: parseMarketNumber(data.price),
      pctChange: parseMarketNumber(data.pctChange),
      absChange: parseMarketNumber(data.absChange),
      prevClose: parseMarketNumber(data.prevClose),
      extendedMarket,
      movement: movementMap[item.symbol] || '',
    };
  });

  const handleAddWatchItem = (item) => addMarketWatchItem({ ...item, region: item.region || activeRegion });

  const handleRegionChange = (region) => {
    if (!MARKET_REGIONS[region] || region === activeRegion) return;
    setActiveRegion(region);
    saveActiveMarketRegion(region);
    setMovementMap({});
    Toast.show({ content: `已切换到${MARKET_REGIONS[region].label}` });
  };

  const handleShareMarket = async () => {
    try {
      const shareUrl = new URL('/market', SHARE_BASE_URL);
      if (activeRegion !== 'US') shareUrl.searchParams.set('region', activeRegion);
      const topItems = [...primaryItems, ...optionItems, ...sectorItems]
        .filter((item) => item?.name && Number.isFinite(item?.pctChange))
        .slice(0, 4);
      const highlights = topItems.length > 0
        ? topItems.map((item) => `${item.name} ${item.pctChange >= 0 ? '+' : ''}${item.pctChange.toFixed(2)}%`)
        : ['行情数据正在刷新，稍后可生成更完整的市场快照'];
      const result = await sharePoster({
        typeLabel: '行情',
        title: '市场行情快照',
        subtitle: '指数 · 期权 · 板块 · 自选',
        sectionTitle: '今日关注',
        accent: '#38bdf8',
        accent2: '#2dd4bf',
        metrics: [
          { label: hasRegionWatchlist ? '自选数量' : '股票数量', value: hasRegionWatchlist ? regionWatchlist.length : primaryItems.length, hint: hasRegionWatchlist ? `${regionConfig.label}关注` : regionConfig.shareHint },
          { label: '期权关注', value: optionItems.length, hint: activeRegion === 'US' ? '合约监控' : '仅美股区域' },
          { label: '板块池', value: sectorItems.length, hint: '主题雷达' },
          { label: '刷新间隔', value: `${MARKET_POLL_INTERVAL_MS / 1000}s`, hint: '本地监控' },
        ],
        highlights,
        footer: `行情链接 ${shareUrl.toString()}`,
        fileName: `investbrain-market-${Date.now()}.png`,
      });
      Toast.show({ icon: 'success', content: result.mode === 'native' ? '分享图已发送' : '分享图已下载' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        Toast.show({ content: '已取消分享图生成' });
        return;
      }

      try {
        const shareUrl = new URL('/market', SHARE_BASE_URL).toString();
        await copyText(shareUrl);
        Toast.show({ content: '分享图生成失败，已复制行情链接' });
      } catch {
        Toast.show({ icon: 'fail', content: error.message || '分享图生成失败' });
      }
    }
  };

  return (
    <div className="market-page">
      <MarketHeader
        watchlist={marketWatchlist}
        activeRegion={activeRegion}
        onRegionChange={handleRegionChange}
        regionLabel={regionConfig.label}
        regionSubtitle={regionConfig.subtitle}
        onAddWatchItem={handleAddWatchItem}
      />
      
      <div className="market-page__content">
        <section aria-label={hasRegionWatchlist ? `${regionConfig.label}关注行情` : regionConfig.spotlightLabel}>
          <div className="market-section-row market-section-row--compact">
            <div className="market-section-title market-section-title--cyan">
              <span className="market-section-title__bar" />
              <h2>{hasRegionWatchlist ? `${regionConfig.label}关注` : regionConfig.spotlightLabel}</h2>
              <span className="market-section-title__count">{primaryItems.length}</span>
            </div>
            <span className="market-section-title__meta">
              {hasRegionWatchlist ? '我的关注' : '完整榜单'}
            </span>
          </div>
          <IndexCardScroller
            items={primaryItems}
            colorConvention={colorConvention}
            loading={loading}
            variant="spotlight"
          />
        </section>

        {activeRegion === 'US' && (
        <section>
          <div className="market-section-title market-section-title--orange">
            <span className="market-section-title__bar" />
            <h2>期权</h2>
          </div>
          {optionItems.length > 0 ? (
            <OptionMonitorStrip
              items={optionItems}
              underlyingQuotes={marketData}
              colorConvention={colorConvention}
              loading={optionLoading}
            />
          ) : (
            <div className="market-watchlist-empty market-options-empty">
              <div className="market-watchlist-empty__title">暂无期权</div>
              <p>关注期权后显示关注合约；没有关注时显示最近买入的期权。</p>
            </div>
          )}
        </section>
        )}

        <section>
          <div className="market-section-row">
            <div className="market-section-title market-section-title--blue">
              <span className="market-section-title__bar" />
              <h2>{regionConfig.sectorTitle}</h2>
              <span className="market-section-title__hint">?</span>
            </div>
            <button
              type="button"
              className="market-share-button"
              aria-label="分享行情"
              onClick={handleShareMarket}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M18 16.1c-.8 0-1.5.3-2 .8L8.9 12.7c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 3 2.9s3-1.3 3-2.9-1.3-2.9-3-2.9z" />
              </svg>
            </button>
          </div>
          <SectorGrid items={sectorItems} colorConvention={colorConvention} refreshing={marketRefreshing} />
        </section>

        <section>
          <div className="market-section-row">
            <div className="market-section-title market-section-title--cyan">
              <span className="market-section-title__bar" />
              <h2>我的关注</h2>
              <span className="market-section-title__count">{regionWatchlist.length}</span>
            </div>
          </div>
          <WatchlistBoard
            items={watchlistItems}
            colorConvention={colorConvention}
            onRemove={removeMarketWatchItem}
            refreshing={marketRefreshing}
          />
        </section>
      </div>
    </div>
  );
}
