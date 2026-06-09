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
import { sharePoster } from '../utils/sharePoster';
import './MarketPage.css';

const SHARE_BASE_URL = 'https://invest-brain.vercel.app';
const MARKET_DATA_CACHE_KEY = 'ib_market_page_cache';
const MARKET_CLIENT_CACHE_TTL_MS = 30_000;
const MARKET_POLL_INTERVAL_MS = 8_000;
const MARKET_FLASH_MS = 1_100;

const DEFAULT_STOCKS = [
  { symbol: 'NVDA', name: '英伟达', quoteLabel: '股票 · NVDA' },
  { symbol: 'AAPL', name: '苹果', quoteLabel: '股票 · AAPL' },
  { symbol: 'TSLA', name: '特斯拉', quoteLabel: '股票 · TSLA' },
];

const SECTORS = [
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
  { symbol: 'gb_ufos', name: '卫星', icon: '🛰' }
];

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
  const priceMemoryRef = useRef({});
  const flashTimersRef = useRef({});

  const optionCandidates = useMemo(() => getOptionCandidates({
    watchlist: marketWatchlist,
    trades,
    limit: 3,
  }), [marketWatchlist, trades]);
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
    const hasWatchlist = marketWatchlist.length > 0;
    const primaryConfigs = hasWatchlist ? marketWatchlist : DEFAULT_STOCKS;
    const primarySymbols = getUniqueSymbols(primaryConfigs.map(item => item.symbol));
    const secondarySymbols = getUniqueSymbols([
      ...SECTORS.map(s => s.symbol),
      ...marketWatchlist.map(item => item.symbol),
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
      if (!symbols.length) return {};

      const symbolParam = symbols.join(',');
      const params = new URLSearchParams({ symbols: symbolParam });
      if (extended) params.set('extended', '1');

      const res = await fetch(`/api/market?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Network response was not ok');

      const json = await res.json();
      if (!json.success) return {};

      return json.data || {};
    };

    const fetchMarketData = async (isInitial = false) => {
      activeController?.abort();
      activeController = new AbortController();
      const { signal } = activeController;
      if (mounted) setMarketRefreshing(true);

      const primaryRequest = fetchSymbolGroup(primarySymbols, signal, { extended: hasWatchlist });
      const secondaryRequest = fetchSymbolGroup(secondarySymbols, signal);

      try {
        mergeMarketData(await primaryRequest);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch primary market data:', err);
        }
      } finally {
        if (mounted && isInitial) setLoading(false);
      }

      try {
        mergeMarketData(await secondaryRequest);
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
  }, [marketWatchlist, optionUnderlyingSymbols]);

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
        const grouped = optionCandidates.reduce((acc, candidate) => {
          const key = `${candidate.underlying}:${candidate.expiration}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(candidate);
          return acc;
        }, {});
        const nextQuotes = {};

        await Promise.all(Object.entries(grouped).map(async ([, candidates]) => {
          const first = candidates[0];
          const params = new URLSearchParams({
            symbol: first.underlying,
            expiration: first.expiration,
            provider: marketDataConfig.optionProvider || 'auto',
          });
          const res = await fetch(`/api/options-chain?${params.toString()}`, {
            signal: activeController.signal,
            headers: {
              ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
              ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
            },
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || '期权行情加载失败');

          candidates.forEach((candidate) => {
            const match = findMatchingOption(json.options || [], candidate);
            if (match) {
              nextQuotes[candidate.id] = mergeOptionQuote(candidate, match);
            }
          });
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

  const hasWatchlist = marketWatchlist.length > 0;
  const primaryItems = mapData(hasWatchlist ? marketWatchlist : DEFAULT_STOCKS);
  const optionItems = optionCandidates.map((candidate) => ({
    ...candidate,
    ...(optionQuotes[candidate.id] || {}),
    price: optionQuotes[candidate.id]?.price ?? null,
    pctChange: optionQuotes[candidate.id]?.pctChange ?? null,
    absChange: optionQuotes[candidate.id]?.absChange ?? null,
    quoteLabel: optionQuotes[candidate.id]?.quoteLabel || `${candidate.underlying} · ${candidate.expiration.slice(5)} · ${candidate.optionType}`,
    movement: movementMap[candidate.id] || '',
  }));
  const sectorItems = mapData(SECTORS);
  const watchlistItems = marketWatchlist.map((item) => {
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

  const handleAddWatchItem = (item) => addMarketWatchItem(item);

  const handleShareMarket = async () => {
    try {
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
          { label: hasWatchlist ? '自选数量' : '股票数量', value: hasWatchlist ? marketWatchlist.length : primaryItems.length, hint: hasWatchlist ? '我的关注' : '默认美股' },
          { label: '期权关注', value: optionItems.length, hint: '合约监控' },
          { label: '板块池', value: sectorItems.length, hint: '主题雷达' },
          { label: '刷新间隔', value: `${MARKET_POLL_INTERVAL_MS / 1000}s`, hint: '本地监控' },
        ],
        highlights,
        footer: `行情链接 ${new URL('/market', SHARE_BASE_URL).toString()}`,
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
        onAddWatchItem={handleAddWatchItem}
      />
      
      <div className="market-page__content">
        <section aria-label={hasWatchlist ? '我的关注行情' : '热门美股股价'}>
          <IndexCardScroller
            items={primaryItems}
            colorConvention={colorConvention}
            loading={loading}
            variant={hasWatchlist ? 'watchlist' : 'spotlight'}
          />
        </section>

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

        <section>
          <div className="market-section-row">
            <div className="market-section-title market-section-title--blue">
              <span className="market-section-title__bar" />
              <h2>美股夜盘</h2>
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
              <span className="market-section-title__count">{marketWatchlist.length}</span>
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
