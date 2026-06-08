import { useState, useEffect, useCallback } from 'react';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
import EmptyState from '../components/common/EmptyState';
import { parseDateTime } from '../utils/time';
import { getTradeMultiplier, getTradeQuantityUnit } from '../utils/tradeLifecycle';
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
  const d = parseDateTime(dateStr);
  if (!d) return '—';
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
  const workspaceScope = useAppStore((s) => s.workspaceScope);
  const isTeamWorkspace = workspaceScope === 'team';

  const [expandedId, setExpandedId] = useState(null);
  const [expandedTrades, setExpandedTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('ib_holdings_view_mode') || 'compact';
    } catch {
      return 'compact';
    }
  });
  const [authors, setAuthors] = useState([]);
  const [authorSearch, setAuthorSearch] = useState('');
  const [selectedAuthor, setSelectedAuthor] = useState('');

  const activeAuthor = selectedAuthor || null;
  const filteredAuthors = authors.filter((author) =>
    author.toLowerCase().includes(authorSearch.trim().toLowerCase())
  );

  useEffect(() => {
    setSelectedAuthor('');
    setAuthorSearch('');
    setExpandedId(null);
    setExpandedTrades([]);
  }, [workspaceScope]);

  useEffect(() => {
    refreshHoldings(activeAuthor, workspaceScope);
  }, [activeAuthor, refreshHoldings, workspaceScope]);

  useEffect(() => {
    let cancelled = false;
    async function loadAuthors() {
      try {
        const rows = await db.getTradeAuthors(workspaceScope);
        if (!cancelled) {
          setAuthors(rows.map((row) => row.author).filter(Boolean));
        }
      } catch (err) {
        console.error('Failed to load trade authors:', err);
      }
    }
    loadAuthors();
    return () => {
      cancelled = true;
    };
  }, [holdings.length, workspaceScope]);

  const handleToggle = useCallback(
    async (assetId, broker, groupAuthor) => {
      const queryAuthor = activeAuthor || groupAuthor || null;
      const key = `${assetId}-${broker || ''}-${queryAuthor || 'ALL'}`;
      if (expandedId === key) {
        setExpandedId(null);
        setExpandedTrades([]);
        return;
      }
      setExpandedId(key);
      setTradesLoading(true);
      try {
        const trades = await db.getTradesByAssetAndBroker(assetId, broker, queryAuthor, workspaceScope);
        setExpandedTrades(trades);
      } catch (err) {
        console.error('Failed to load trades for asset:', err);
        setExpandedTrades([]);
      } finally {
        setTradesLoading(false);
      }
    },
    [activeAuthor, expandedId, workspaceScope]
  );

  const handleViewModeChange = (nextMode) => {
    setViewMode(nextMode);
    try {
      localStorage.setItem('ib_holdings_view_mode', nextMode);
    } catch {
      // Ignore storage failures; the current session still updates.
    }
  };

  const totalBuys = Number(summary?.total_buys) || 0;
  const totalSells = Number(summary?.total_sells) || 0;
  const realizedPnl = Number(summary?.realized_pnl) || 0;
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
            {isTeamWorkspace ? '团队镜像数据聚合计算' : '基于我的交易记录自动计算'}
          </p>
        </div>
      </div>

      {/* ── Portfolio Summary ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__summary glass-card">
          <div className="holdings-page__summary-label">
            {selectedAuthor
              ? `${selectedAuthor} 的持仓`
              : isTeamWorkspace
                ? '团队投资组合'
                : '我的持仓'}
          </div>

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

      <div className="holdings-page__section">
        <div className="holdings-page__author-filter glass-card">
          <div className="holdings-page__author-filter-header">
            <span>按提交人查看</span>
            {selectedAuthor && (
              <button
                className="holdings-page__author-clear"
                onClick={() => {
                  setSelectedAuthor('');
                  setExpandedId(null);
                  setExpandedTrades([]);
                }}
              >
                查看全部
              </button>
            )}
          </div>
          <input
            className="holdings-page__author-search"
            value={authorSearch}
            onChange={(event) => setAuthorSearch(event.target.value)}
            placeholder="搜索花名"
          />
          <div className="holdings-page__author-pills">
            <button
              className={`holdings-page__author-pill ${!selectedAuthor ? 'holdings-page__author-pill--active' : ''}`}
              onClick={() => {
                setSelectedAuthor('');
                setExpandedId(null);
                setExpandedTrades([]);
              }}
            >
              全部
            </button>
            {filteredAuthors.map((author) => (
              <button
                key={author}
                className={`holdings-page__author-pill ${selectedAuthor === author ? 'holdings-page__author-pill--active' : ''}`}
                onClick={() => {
                  setSelectedAuthor(author);
                  setExpandedId(null);
                  setExpandedTrades([]);
                }}
              >
                {author}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Holdings List ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__list-toolbar">
          <span className="holdings-page__list-count">
            {holdings.length} 个活跃持仓
          </span>
          <div className="holdings-page__view-toggle" aria-label="持仓视图">
            <button
              className={`holdings-page__view-toggle-btn ${
                viewMode === 'compact' ? 'holdings-page__view-toggle-btn--active' : ''
              }`}
              onClick={() => handleViewModeChange('compact')}
            >
              紧凑
            </button>
            <button
              className={`holdings-page__view-toggle-btn ${
                viewMode === 'card' ? 'holdings-page__view-toggle-btn--active' : ''
              }`}
              onClick={() => handleViewModeChange('card')}
            >
              卡片
            </button>
          </div>
        </div>

        {holdingsLoading && holdings.length === 0 ? (
          <div className="holdings-page__loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton--card" />
            ))}
          </div>
        ) : holdings.length > 0 ? (
          <div className="holdings-page__list">
            {holdings.map((holding, idx) => {
              const holdingKey = `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`;
              const positionValue =
                (Number(holding.total_quantity) || 0) *
                (Number(holding.avg_cost) || 0) *
                getTradeMultiplier({ asset_type: holding.type });
              const isExpanded = expandedId === holdingKey;
              const quantityUnit = getTradeQuantityUnit({
                asset_type: holding.type,
              });

              return (
                <div
                  key={holdingKey}
                  className={`holdings-page__card glass-card ${
                    isExpanded ? 'holdings-page__card--expanded' : ''
                  } ${viewMode === 'compact' ? 'holdings-page__card--compact' : ''}`}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* Card Main Content */}
                  <div
                    className="holdings-page__card-main"
                    onClick={() => handleToggle(holding.asset_id, holding.broker, holding.author)}
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
                        {holding.author && !selectedAuthor && (
                          <span className="holdings-page__author-badge">
                            {holding.author}
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
                        {Number(holding.total_quantity).toLocaleString()} {quantityUnit}
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
                          const tradeUnit = getTradeQuantityUnit({
                            ...trade,
                            asset_type: trade.asset_type || holding.type,
                          });
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
                                  {Number(trade.quantity).toLocaleString()} {tradeUnit} ×
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
            title={isTeamWorkspace ? '团队空间暂无持仓' : '暂无持仓'}
            subtitle={isTeamWorkspace ? '请先在设置中拉取团队空间数据' : '开始录入交易记录后自动生成'}
          />
        )}
      </div>
    </div>
  );
}
