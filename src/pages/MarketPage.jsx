import React, { useState, useEffect } from 'react';
import { Toast } from 'antd-mobile';
import { useAppStore } from '../stores/useAppStore';
import MarketHeader from '../components/Market/MarketHeader';
import IndexCardScroller from '../components/Market/IndexCardScroller';
import SectorGrid from '../components/Market/SectorGrid';
import './MarketPage.css';

const SHARE_BASE_URL = 'https://invest-brain.vercel.app';

const INDICES = [
  { symbol: 'gb_ixic', name: '纳斯达克' },
  { symbol: 'gb_ndx', name: '纳斯达克100' },
  { symbol: 'gb_inx', name: '标普500' }
];

const FUTURES = [
  { symbol: 'hf_NQ', name: '纳指期货' },
  { symbol: 'hf_ES', name: '标普期货' },
  { symbol: 'hf_YM', name: '道琼斯期货' }
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

export default function MarketPage() {
  const { colorConvention } = useAppStore();
  const [marketData, setMarketData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchMarketData = async () => {
      try {
        const allSymbols = [
          ...INDICES.map(i => i.symbol),
          ...FUTURES.map(f => f.symbol),
          ...SECTORS.map(s => s.symbol)
        ].join(',');

        const res = await fetch(`/api/market?symbols=${allSymbols}`);
        if (!res.ok) throw new Error('Network response was not ok');
        
        const json = await res.json();
        if (json.success && mounted) {
          setMarketData(json.data || {});
        }
      } catch (err) {
        console.error('Failed to fetch market data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchMarketData();
    
    // Poll every 5 seconds for real-time updates
    const intervalId = setInterval(fetchMarketData, 5000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Map symbols to full data objects
  const mapData = (configList) => {
    return configList.map(config => {
      const data = marketData[config.symbol] || {};
      return {
        ...config,
        price: parseMarketNumber(data.price),
        pctChange: parseMarketNumber(data.pctChange),
        absChange: parseMarketNumber(data.absChange),
      };
    });
  };

  const indexItems = mapData(INDICES);
  const futureItems = mapData(FUTURES);
  const sectorItems = mapData(SECTORS);

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
      <MarketHeader />
      
      <div className="market-page__content">
        <section aria-label="全球主要指数">
          <IndexCardScroller
            items={indexItems}
            colorConvention={colorConvention}
            loading={loading}
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
      </div>
    </div>
  );
}
