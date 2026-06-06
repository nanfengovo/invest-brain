import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import MarketHeader from '../components/Market/MarketHeader';
import IndexCardScroller from '../components/Market/IndexCardScroller';
import SectorGrid from '../components/Market/SectorGrid';

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
  { symbol: 'gb_botz', name: 'AIGC', icon: '🧠' },
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
      const data = marketData[config.symbol] || { price: 0, pctChange: 0, absChange: 0 };
      return {
        ...config,
        price: data.price,
        pctChange: data.pctChange,
        absChange: data.absChange
      };
    });
  };

  const indexItems = mapData(INDICES);
  const futureItems = mapData(FUTURES);
  const sectorItems = mapData(SECTORS);

  return (
    <div className="bg-[#0B0E14] min-h-screen text-white overflow-y-auto pb-24">
      <MarketHeader />
      
      <div className="px-4 flex flex-col gap-6">
        <div>
          <IndexCardScroller items={indexItems} colorConvention={colorConvention} />
        </div>

        <div>
          <div className="flex items-center mb-3">
            <div className="w-1 h-3.5 bg-indigo-500 rounded-full mr-2"></div>
            <h2 className="text-sm font-semibold text-gray-200 tracking-wide">指数期货</h2>
          </div>
          <IndexCardScroller items={futureItems} colorConvention={colorConvention} />
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center">
              <div className="w-1 h-3.5 bg-indigo-500 rounded-full mr-2"></div>
              <h2 className="text-sm font-semibold text-gray-200 tracking-wide">美股夜盘</h2>
            </div>
            <button className="text-gray-400 p-1 active:scale-95 transition-transform">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
              </svg>
            </button>
          </div>
          <SectorGrid items={sectorItems} colorConvention={colorConvention} />
        </div>
      </div>
    </div>
  );
}
