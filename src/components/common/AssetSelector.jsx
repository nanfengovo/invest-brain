import { useState, useEffect, useRef } from 'react';
import { Input } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import './AssetSelector.css';

export default function AssetSelector({ value, onChange, placeholder = "如: AAPL, BTC", disabled }) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { assets, getHoldings, refreshAssets } = useTradeStore();
  const [holdings, setHoldings] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    // Load holdings to prioritize them
    const loadHoldings = async () => {
      await refreshAssets?.();
      const res = await getHoldings();
      if (res.success && res.data) {
        setHoldings(res.data);
      }
    };
    loadHoldings();
  }, [getHoldings]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (val) => {
    setInputValue(val);
    onChange?.(val);

    if (!val) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const upperVal = val.toUpperCase();
    
    // Find matching assets
    const matches = assets.filter(a => 
      a.symbol.toUpperCase().includes(upperVal) || 
      (a.name && a.name.toUpperCase().includes(upperVal))
    );

    // Prioritize larger holdings
    const holdingWeight = new Map(
      holdings.map((holding) => [
        holding.asset_id,
        Math.abs(Number(holding.total_quantity || 0) * Number(holding.avg_cost || 0)),
      ])
    );
    
    matches.sort((a, b) => {
      const aWeight = holdingWeight.get(a.id) || 0;
      const bWeight = holdingWeight.get(b.id) || 0;
      
      if (aWeight !== bWeight) return bWeight - aWeight;
      
      // If both or neither are holdings, sort by symbol match index
      const aIndex = a.symbol.toUpperCase().indexOf(upperVal);
      const bIndex = b.symbol.toUpperCase().indexOf(upperVal);
      if (aIndex !== bIndex) return aIndex - bIndex;
      
      return a.symbol.localeCompare(b.symbol);
    });

    setSuggestions(matches.slice(0, 5));
    setShowSuggestions(matches.length > 0);
  };

  const handleSelect = (asset) => {
    setInputValue(asset.symbol);
    onChange?.(asset.symbol);
    setShowSuggestions(false);
  };

  return (
    <div className="asset-selector" ref={containerRef}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        clearable
        onFocus={() => {
          if (inputValue && suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
      />
      {showSuggestions && (
        <ul className="asset-selector__suggestions glass-card">
          {suggestions.map(asset => (
            <li 
              key={asset.id} 
              className="asset-selector__suggestion-item"
              onClick={() => handleSelect(asset)}
            >
              <div className="asset-selector__suggestion-symbol">{asset.symbol}</div>
              {asset.name && <div className="asset-selector__suggestion-name">{asset.name}</div>}
              {holdingWeight.has(asset.id) && (
                <span className="asset-selector__suggestion-tag">持仓</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
