import { useState, useEffect } from 'react';
import { PullToRefresh, Popup } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import TradeForm from '../components/Trade/TradeForm';
import TradeCard from '../components/Trade/TradeCard';
import EmptyState from '../components/common/EmptyState';
import './TradesPage.css';

export default function TradesPage() {
  const [showForm, setShowForm] = useState(false);

  const { trades, tradesLoading, refreshTrades, refreshHoldings } =
    useTradeStore();

  useEffect(() => {
    refreshTrades();
  }, [refreshTrades]);

  const handleRefresh = async () => {
    await refreshTrades();
  };

  const handleTradeAdded = () => {
    setShowForm(false);
    refreshTrades();
    refreshHoldings();
  };

  return (
    <div className="trades-page">
      {/* ── Header ── */}
      <div className="trades-page__header">
        <h1 className="trades-page__title">交易记录</h1>
        <p className="trades-page__subtitle">
          共 {trades.length} 笔交易
        </p>
      </div>

      {/* ── Trade List ── */}
      <PullToRefresh onRefresh={handleRefresh}>
        {tradesLoading && trades.length === 0 ? (
          <div className="trades-page__loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton--card" />
            ))}
          </div>
        ) : trades.length > 0 ? (
          <div className="trades-page__list">
            {trades.map((trade) => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="📈"
            title="还没有交易记录"
            subtitle="点击右下角按钮开始记录"
          />
        )}
      </PullToRefresh>

      {/* ── FAB ── */}
      <button
        className="action-fab"
        onClick={() => setShowForm(true)}
        aria-label="添加交易"
      >
        +
      </button>

      {/* ── Trade Form Popup ── */}
      <Popup
        visible={showForm}
        onMaskClick={() => setShowForm(false)}
        position="bottom"
        bodyClassName="trades-page__popup"
        destroyOnClose
      >
        <div className="trades-page__popup-content">
          <div className="trades-page__popup-handle" />
          <div className="trades-page__popup-header">
            <span className="trades-page__popup-title">录入交易</span>
            <button
              className="trades-page__popup-close"
              onClick={() => setShowForm(false)}
            >
              ✕
            </button>
          </div>
          <div className="trades-page__popup-body">
            <TradeForm onSuccess={handleTradeAdded} />
          </div>
        </div>
      </Popup>
    </div>
  );
}
