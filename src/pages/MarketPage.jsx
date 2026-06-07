import React, { useState, useEffect, useRef } from 'react';
import { Toast } from 'antd-mobile';
import { useAppStore } from '../stores/useAppStore';
import MarketHeader from '../components/Market/MarketHeader';
import IndexCardScroller from '../components/Market/IndexCardScroller';
import SectorGrid from '../components/Market/SectorGrid';
import WatchlistBoard from '../components/Market/WatchlistBoard';
import './MarketPage.css';

const SHARE_BASE_URL = 'https://invest-brain.vercel.app';
const MARKET_DATA_CACHE_KEY = 'ib_market_page_cache';
const MARKET_CLIENT_CACHE_TTL_MS = 30_000;
const MARKET_POLL_INTERVAL_MS = 8_000;
const MARKET_FLASH_MS = 1_100;

const INDICES = [
  { symbol: 'gb_ixic', name: '纳斯达克综合', quoteLabel: '指数 · ^IXIC' },
  { symbol: 'gb_ndx', name: '纳斯达克100', quoteLabel: '指数 · ^NDX' },
  { symbol: 'gb_inx', name: '标普500', quoteLabel: '指数 · ^GSPC' }
];

const FUTURES = [
  { symbol: 'hf_NQ', name: '纳指期货', quoteLabel: '期货 · NQ=F' },
  { symbol: 'hf_ES', name: '标普期货', quoteLabel: '期货 · ES=F' },
  { symbol: 'hf_YM', name: '道琼斯期货', quoteLabel: '期货 · YM=F' }
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
  } = useAppStore();
  const [marketData, setMarketData] = useState(() => readCachedMarketData());
  const [loading, setLoading] = useState(() => Object.keys(readCachedMarketData()).length === 0);
  const [movementMap, setMovementMap] = useState({});
  const priceMemoryRef = useRef({});
  const flashTimersRef = useRef({});

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
    const primaryConfigs = hasWatchlist ? marketWatchlist : INDICES;
    const primarySymbols = getUniqueSymbols(primaryConfigs.map(item => item.symbol));

    const futureSymbols = getUniqueSymbols(FUTURES.map(f => f.symbol));
    const secondarySymbols = getUniqueSymbols([
      ...SECTORS.map(s => s.symbol),
      ...marketWatchlist.map(item => item.symbol),
    ]).filter((symbol) => !primarySymbols.includes(symbol) && !futureSymbols.includes(symbol));

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

      const primaryRequest = fetchSymbolGroup(primarySymbols, signal, { extended: hasWatchlist });
      const futuresRequest = fetchSymbolGroup(futureSymbols, signal);
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
        mergeMarketData(await futuresRequest);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch futures market data:', err);
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
      }
    };

    fetchMarketData(true);
    
    const intervalId = setInterval(() => fetchMarketData(false), MARKET_POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      activeController?.abort();
      clearInterval(intervalId);
    };
  }, [marketWatchlist]);

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
  const primaryItems = mapData(hasWatchlist ? marketWatchlist : INDICES);
  const futureItems = mapData(FUTURES);
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
    const shareUrl = new URL('/market', SHARE_BASE_URL).toString();
    const shareData = {
      title: '行情监控',
      text: '查看全球主要指数、期货和美股夜盘行情',
      url: shareUrl,
    };

    try {
      await copyText(shareUrl);

      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      Toast.show({ content: '行情链接已复制，可粘贴到微信发送' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        Toast.show({ content: '行情链接已复制，可粘贴到微信发送' });
        return;
      }

      try {
        await copyText(shareUrl);
        Toast.show({ content: '行情链接已复制，可粘贴到微信发送' });
      } catch {
        Toast.show({ content: shareUrl, duration: 4000 });
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
        <section aria-label={hasWatchlist ? '我的关注行情' : '全球主要指数'}>
          <IndexCardScroller
            items={primaryItems}
            colorConvention={colorConvention}
            loading={loading}
            variant={hasWatchlist ? 'watchlist' : 'indices'}
          />
        </section>

        <section>
          <div className="market-section-title market-section-title--orange">
            <span className="market-section-title__bar" />
            <h2>指数期货</h2>
          </div>
          <IndexCardScroller
            items={futureItems}
            colorConvention={colorConvention}
            loading={loading}
            variant="futures"
          />
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
          <SectorGrid items={sectorItems} colorConvention={colorConvention} />
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
          />
        </section>
      </div>
    </div>
  );
}
