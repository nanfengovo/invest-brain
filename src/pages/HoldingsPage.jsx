import { useState, useEffect, useCallback } from 'react';
import { useTradeStore } from '../stores/useTradeStore';
import { db } from '../db/database';
import EmptyState from '../components/common/EmptyState';
import './HoldingsPage.css';

const formatCurrency = (num) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const TYPE_LABELS = {
  STOCK: '股票',
  OPTION: '期权',
  ETF: 'ETF',
  CRYPTO: '加密',
  FUND: '基金',
};

export default function HoldingsPage() {
  const { holdings, summary, holdingsLoading, refreshHoldings } =
    useTradeStore();

  const [expandedId, setExpandedId] = useState(null);
  const [expandedTrades, setExpandedTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  useEffect(() => {
    refreshHoldings();
  }, [refreshHoldings]);

  const handleToggle = useCallback(
    async (assetId, broker) => {
      const key = `${assetId}-${broker || ''}`;
      if (expandedId === key) {
        setExpandedId(null);
        setExpandedTrades([]);
        return;
      }
      setExpandedId(key);
      setTradesLoading(true);
      try {
        const trades = await db.getTradesByAssetAndBroker(assetId, broker);
        setExpandedTrades(trades);
      } catch (err) {
        console.error('Failed to load trades for asset:', err);
        setExpandedTrades([]);
      } finally {
        setTradesLoading(false);
      }
    },
    [expandedId]
  );

  const totalBuys = Number(summary?.total_buys) || 0;
  const totalSells = Number(summary?.total_sells) || 0;
  const realizedPnl = totalSells - totalBuys;
  const pnlClass =
    realizedPnl > 0 ? 'profit' : realizedPnl < 0 ? 'loss' : 'neutral';
  const pnlPrefix = realizedPnl > 0 ? '+' : '';

  return (
    <div className="holdings-page">
      {/* ── Header ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__header">
          <h1 className="holdings-page__title">持仓总览</h1>
          <p className="holdings-page__subtitle">
            基于交易记录自动计算
          </p>
        </div>
      </div>

      {/* ── Portfolio Summary ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__summary glass-card">
          <div className="holdings-page__summary-label">投资组合</div>

          <div className="holdings-page__summary-grid">
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                ${formatCurrency(totalBuys)}
              </div>
              <div className="holdings-page__summary-item-label">总买入</div>
            </div>
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                ${formatCurrency(totalSells)}
              </div>
              <div className="holdings-page__summary-item-label">总卖出</div>
            </div>
            <div className="holdings-page__summary-item">
              <div
                className={`holdings-page__summary-item-value holdings-page__summary-item-value--${pnlClass} text-mono`}
              >
                {pnlPrefix}${formatCurrency(realizedPnl)}
              </div>
              <div className="holdings-page__summary-item-label">已实现盈亏</div>
            </div>
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                {holdings.length}
              </div>
              <div className="holdings-page__summary-item-label">活跃持仓</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Holdings List ── */}
      <div className="holdings-page__section">
        {holdingsLoading && holdings.length === 0 ? (
          <div className="holdings-page__loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton--card" />
            ))}
          </div>
        ) : holdings.length > 0 ? (
          <div className="holdings-page__list">
            {holdings.map((holding, idx) => {
              const holdingKey = `${holding.asset_id}-${holding.broker || ''}`;
              const positionValue =
                (Number(holding.total_quantity) || 0) *
                (Number(holding.avg_cost) || 0);
              const isExpanded = expandedId === holdingKey;

              return (
                <div
                  key={holdingKey}
                  className={`holdings-page__card glass-card ${
                    isExpanded ? 'holdings-page__card--expanded' : ''
                  }`}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* Card Main Content */}
                  <div
                    className="holdings-page__card-main"
                    onClick={() => handleToggle(holding.asset_id, holding.broker)}
                  >
                    <div className="holdings-page__card-left">
                      <div className="holdings-page__symbol-row">
                        <span className="holdings-page__symbol">
                          {holding.symbol}
                        </span>
                        <span
                          className={`holdings-page__type-badge holdings-page__type-badge--${(
                            holding.type || 'STOCK'
                          ).toLowerCase()}`}
                        >
                          {TYPE_LABELS[holding.type] || holding.type || 'STOCK'}
                        </span>
                      </div>
                      <div className="holdings-page__name-row">
                        <span className="holdings-page__name">
                          {holding.name || holding.symbol}
                        </span>
                        {holding.broker && (
                          <span className="holdings-page__broker-badge">
                            🏦 {holding.broker}
                          </span>
                        )}
                      </div>
                      {holding.sector && (
                        <div className="holdings-page__sector">
                          {holding.sector}
                        </div>
                      )}
                    </div>

                    <div className="holdings-page__card-right">
                      <div className="holdings-page__position-value text-mono">
                        ${formatCurrency(positionValue)}
                      </div>
                      <div className="holdings-page__quantity text-mono">
                        {Number(holding.total_quantity).toLocaleString()} 股
                      </div>
                      <div className="holdings-page__avg-cost text-mono">
                        均价 ${formatCurrency(holding.avg_cost)}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer — trade count & last trade */}
                  <div className="holdings-page__card-footer">
                    <span className="holdings-page__trade-count">
                      {holding.trade_count} 笔交易
                    </span>
                    <span className="holdings-page__last-trade">
                      最近 {formatDate(holding.last_trade)}
                    </span>
                    <span
                      className={`holdings-page__expand-icon ${
                        isExpanded ? 'holdings-page__expand-icon--open' : ''
                      }`}
                    >
                      ▾
                    </span>
                  </div>

                  {/* Expanded Trades List */}
                  {isExpanded && (
                    <div className="holdings-page__trades-list">
                      {tradesLoading ? (
                        <div className="holdings-page__trades-loading">
                          加载中…
                        </div>
                      ) : expandedTrades.length > 0 ? (
                        expandedTrades.map((trade) => {
                          const isBuy =
                            trade.direction === 'BUY' ||
                            trade.direction === 'OPEN';
                          return (
                            <div
                              key={trade.id}
                              className="holdings-page__trade-item"
                            >
                              <div className="holdings-page__trade-left">
                                <span
                                  className={`holdings-page__trade-direction holdings-page__trade-direction--${
                                    isBuy ? 'buy' : 'sell'
                                  }`}
                                >
                                  {isBuy ? '买入' : '卖出'}
                                </span>
                                <span className="holdings-page__trade-date">
                                  {formatDate(trade.trade_time)}
                                </span>
                              </div>
                              <div className="holdings-page__trade-right">
                                <span className="holdings-page__trade-qty text-mono">
                                  {Number(trade.quantity).toLocaleString()} ×
                                </span>
                                <span className="holdings-page__trade-price text-mono">
                                  ${formatCurrency(trade.price)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="holdings-page__trades-empty">
                          暂无交易记录
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="📊"
            title="暂无持仓"
            subtitle="开始录入交易记录后自动生成"
          />
        )}
      </div>
    </div>
  );
}
