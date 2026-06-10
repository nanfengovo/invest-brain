import { useState, useEffect, useMemo } from 'react';
import { PullToRefresh, Popup } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import TradeForm from '../components/Trade/TradeForm';
import TradeCard from '../components/Trade/TradeCard';
import TradeFilter from '../components/Trade/TradeFilter';
import EmptyState from '../components/common/EmptyState';
import { toDateGroupKey } from '../utils/time';
import {
  annotateTradesWithLifecycle,
  formatLifecyclePnl,
  getTradeDirectionKind,
} from '../utils/tradeLifecycle';
import './TradesPage.css';

const getTradeTimeMs = (trade = {}) => {
  const time = new Date(trade.trade_time).getTime();
  return Number.isFinite(time) ? time : 0;
};

const isClosedTradeLoop = (trades = []) => {
  const lifecycle = trades[0]?.lifecycle;
  if (lifecycle?.status !== 'CLOSED') return false;
  const hasBuy = trades.some((trade) => getTradeDirectionKind(trade.direction) === 'BUY');
  const hasSell = trades.some((trade) => getTradeDirectionKind(trade.direction) === 'SELL');
  return hasBuy && hasSell;
};

function buildTradeEntries(trades = []) {
  const groupedByLifecycle = new Map();
  trades.forEach((trade) => {
    const key = trade.lifecycle?.key || trade.id;
    if (!groupedByLifecycle.has(key)) groupedByLifecycle.set(key, []);
    groupedByLifecycle.get(key).push(trade);
  });

  const loopTradeIds = new Set();
  const loopEntries = [];
  groupedByLifecycle.forEach((groupTrades, key) => {
    if (!isClosedTradeLoop(groupTrades)) return;
    const sortedTrades = [...groupTrades].sort((a, b) => getTradeTimeMs(a) - getTradeTimeMs(b));
    sortedTrades.forEach((trade) => loopTradeIds.add(trade.id));
    const latestTrade = sortedTrades.reduce((latest, trade) => (
      getTradeTimeMs(trade) >= getTradeTimeMs(latest) ? trade : latest
    ), sortedTrades[0]);
    const lifecycle = latestTrade.lifecycle || sortedTrades[0]?.lifecycle || {};
    loopEntries.push({
      kind: 'loop',
      id: `loop-${key}`,
      key,
      trades: sortedTrades,
      lifecycle,
      latestTrade,
      latestTime: getTradeTimeMs(latestTrade),
      title: latestTrade.option_display?.title || latestTrade.underlying_symbol || latestTrade.symbol || '闭环交易',
      pnl: Number(lifecycle.realizedPnl) || 0,
    });
  });

  const singleEntries = trades
    .filter((trade) => !loopTradeIds.has(trade.id))
    .map((trade) => ({
      kind: 'trade',
      id: trade.id,
      trade,
      latestTrade: trade,
      latestTime: getTradeTimeMs(trade),
    }));

  return [...loopEntries, ...singleEntries].sort((a, b) => b.latestTime - a.latestTime);
}

export default function TradesPage() {
  const [showForm, setShowForm] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);

  const [filters, setFilters] = useState({
    symbol: '',
    sector: 'ALL',
    direction: 'ALL',
    lifecycle: 'ALL',
    groupBy: 'DAY',
    compactMode: true,
  });

  const { trades, tradesLoading, refreshTrades, refreshHoldings } =
    useTradeStore();
  const workspaceScope = useAppStore((s) => s.workspaceScope);
  const isTeamWorkspace = workspaceScope === 'team';

  useEffect(() => {
    refreshTrades();
  }, [refreshTrades, workspaceScope]);

  const handleRefresh = async () => {
    await refreshTrades();
  };

  const handleTradeAdded = () => {
    setShowForm(false);
    setEditingTrade(null);
    refreshTrades();
    refreshHoldings();
  };

  const handleEditTrade = (trade) => {
    if (isTeamWorkspace || trade.workspace_scope === 'team') return;
    setEditingTrade(trade);
    setShowForm(true);
  };

  // Extract available sectors dynamically
  const availableSectors = useMemo(() => {
    const sectors = new Set(trades.map(t => t.asset_sector).filter(Boolean));
    return Array.from(sectors);
  }, [trades]);

  // Apply filters
  const filteredTrades = useMemo(() => {
    const annotatedTrades = annotateTradesWithLifecycle(trades);
    return annotatedTrades.filter(t => {
      const symbolHaystack = [
        t.symbol,
        t.underlying_symbol,
        t.contract_symbol,
        t.option_display?.title,
      ].filter(Boolean).join(' ').toLowerCase();
      if (filters.symbol && !symbolHaystack.includes(filters.symbol.toLowerCase())) return false;
      if (filters.sector !== 'ALL' && t.asset_sector !== filters.sector) return false;
      if (filters.direction !== 'ALL' && t.direction !== filters.direction) return false;
      if (filters.lifecycle !== 'ALL' && t.lifecycle?.status !== filters.lifecycle) return false;
      return true;
    });
  }, [trades, filters]);

  const filteredEntries = useMemo(() => buildTradeEntries(filteredTrades), [filteredTrades]);

  const renderTradeEntry = (entry, idx) => {
    if (entry.kind !== 'loop') {
      return (
        <TradeCard
          key={entry.id}
          trade={entry.trade}
          index={idx}
          onEdit={handleEditTrade}
          compactMode={filters.compactMode}
        />
      );
    }

    const pnlTone = entry.pnl >= 0 ? 'profit' : 'loss';
    return (
      <div key={entry.id} className={`trade-loop trade-loop--${pnlTone}`}>
        <div className="trade-loop__header">
          <div>
            <span className="trade-loop__eyebrow">闭环交易</span>
            <strong>{entry.title}</strong>
          </div>
          <div className={`trade-loop__pnl trade-loop__pnl--${pnlTone}`}>
            <span>已实现</span>
            <b>{formatLifecyclePnl(entry.pnl)}</b>
          </div>
        </div>
        <div className="trade-loop__items">
          {entry.trades.map((trade, tradeIndex) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              index={tradeIndex}
              onEdit={handleEditTrade}
              compactMode={filters.compactMode}
              loopClosed
            />
          ))}
        </div>
      </div>
    );
  };

  const renderList = () => {
    if (tradesLoading && trades.length === 0) {
      return (
        <div className="trades-page__loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton--card" />
          ))}
        </div>
      );
    }

    if (trades.length === 0) {
      return (
        <EmptyState
          icon="📈"
          title={isTeamWorkspace ? '团队空间暂无交易' : '还没有交易记录'}
          subtitle={isTeamWorkspace ? '请先在设置中拉取团队空间数据' : '点击右下角按钮开始记录'}
        />
      );
    }

    if (filteredEntries.length === 0) {
      return (
        <EmptyState
          icon="📉"
          title="没有符合条件的记录"
          subtitle="尝试调整过滤条件"
        />
      );
    }

    if (filters.groupBy === 'NONE') {
      return (
        <div className="trades-page__list">
          {filteredEntries.map(renderTradeEntry)}
        </div>
      );
    }

    // Grouping
    const groups = {};
    filteredEntries.forEach((entry) => {
      const t = entry.latestTrade;
      let key = '未分类';
      if (filters.groupBy === 'DATE' || filters.groupBy === 'DAY' || filters.groupBy === 'WEEK' || filters.groupBy === 'MONTH') {
        key = toDateGroupKey(t.trade_time, filters.groupBy === 'DATE' ? 'DAY' : filters.groupBy);
      } else if (filters.groupBy === 'ASSET') {
        key = entry.title || t.option_display?.title || t.underlying_symbol || t.symbol || '未知标的';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });

    return (
      <div className="trades-page__list">
        {Object.entries(groups).map(([groupKey, groupEntries]) => (
          <div key={groupKey} className="trade-group">
            <div className="trade-group__header">{groupKey}</div>
            <div className="trade-group__items">
              {groupEntries.map(renderTradeEntry)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="trades-page">
      {/* ── Header ── */}
      <div className="trades-page__header">
        <div className="trades-page__header-left">
          <h1 className="trades-page__title">交易记录</h1>
          <p className="trades-page__subtitle">
            {isTeamWorkspace ? '团队镜像' : '我的工作区'} · 共 {filteredTrades.length} 笔交易
            {trades.length !== filteredTrades.length && <span style={{color: 'var(--color-primary)'}}> (已过滤)</span>}
          </p>
        </div>
        <button className="btn-filter" onClick={() => setShowFilter(true)}>
          ⚙️ 筛选/视图
        </button>
      </div>

      {/* ── Trade List ── */}
      <PullToRefresh onRefresh={handleRefresh}>
        {renderList()}
      </PullToRefresh>

      {/* ── FAB ── */}
      {!isTeamWorkspace && (
        <button
          className="action-fab"
          onClick={() => {
            setEditingTrade(null);
            setShowForm(true);
          }}
          aria-label="添加交易"
        >
          +
        </button>
      )}

      {/* ── Trade Filter Popup ── */}
      <Popup
        visible={showFilter}
        onMaskClick={() => setShowFilter(false)}
        position="right"
        bodyStyle={{ width: '85vw' }}
      >
        <TradeFilter
          filters={filters}
          onChange={(updates) => setFilters(prev => ({ ...prev, ...updates }))}
          onReset={() => setFilters({
            symbol: '', sector: 'ALL', direction: 'ALL', lifecycle: 'ALL', groupBy: 'DAY', compactMode: true
          })}
          onClose={() => setShowFilter(false)}
          availableSectors={availableSectors}
        />
      </Popup>

      {/* ── Trade Form Popup ── */}
      <Popup
        visible={showForm}
        onMaskClick={() => {
          setShowForm(false);
          setEditingTrade(null);
        }}
        position="bottom"
        bodyClassName="trades-page__popup"
        destroyOnClose
      >
        <div className="trades-page__popup-content">
          <div className="trades-page__popup-handle" />
          <div className="trades-page__popup-header">
            <span className="trades-page__popup-title">{editingTrade ? '编辑交易' : '录入交易'}</span>
            <button
              className="trades-page__popup-close"
              onClick={() => {
                setShowForm(false);
                setEditingTrade(null);
              }}
            >
              ✕
            </button>
          </div>
          <div className="trades-page__popup-body">
            <TradeForm onSuccess={handleTradeAdded} initialData={editingTrade} onClose={() => {
              setShowForm(false);
              setEditingTrade(null);
            }} />
          </div>
        </div>
      </Popup>
    </div>
  );
}
