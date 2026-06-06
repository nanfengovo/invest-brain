import React, { useState } from 'react';
import { SearchOutline } from 'antd-mobile-icons';
import SearchModal from '../common/SearchModal';
import './MarketHeader.css';

export default function MarketHeader() {
  const [searchVisible, setSearchVisible] = useState(false);

  return (
    <div className="market-header">
      <div className="market-header__left">
        <div className="market-header__title-row">
          <div className="market-header__icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <div className="market-header__title-wrapper">
            <h1 className="market-header__title">行情</h1>
            <span className="market-header__status">
              <span className="market-header__status-dot"></span>
              交易中
            </span>
          </div>
        </div>
        <div className="market-header__subtitle">全球主要指数实时监控</div>
      </div>
      <div className="market-header__right">
        <div className="market-header__flags">
          <span className="flag">🇨🇳</span>
          <span className="flag active">🇺🇸</span>
          <span className="flag">🇭🇰</span>
        </div>
        <div className="market-header__search" onClick={() => setSearchVisible(true)}>
          <SearchOutline />
        </div>
      </div>
      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />
    </div>
  );
}
