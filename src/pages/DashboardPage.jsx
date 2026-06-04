import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import EmptyState from '../components/common/EmptyState';
import DecisionCard from '../components/Decision/DecisionCard';
import './DashboardPage.css';

const formatCurrency = (num) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = () => {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { holdings, summary, stats, decisions, holdingsLoading, refreshHoldings, refreshDecisions } =
    useTradeStore();
  const { isDbPersistent } = useAppStore();

  useEffect(() => {
    refreshHoldings();
    refreshDecisions();
  }, [refreshHoldings, refreshDecisions]);

  const activeDecisions = decisions.filter(d => d.status !== 'CLOSED' && d.status !== 'ENDED');

  const totalInvested = Number(summary?.total_buys) || 0;
  const totalPnl = (Number(summary?.total_sells) || 0) - totalInvested;
  const holdingsCount = stats?.asset_count ?? holdings.length ?? 0;
  const tradesCount = stats?.trade_count ?? 0;
  const decisionsCount = stats?.decision_count ?? 0;

  const pnlClass =
    totalPnl > 0 ? 'profit' : totalPnl < 0 ? 'loss' : 'neutral';
  const pnlPrefix = totalPnl > 0 ? '+' : '';

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <div className="dashboard__section">
        <div className="dashboard__header">
          <div className="dashboard__greeting">
            <h1 className="dashboard__title">投资大脑</h1>
            <p className="dashboard__date">{formatDate()}</p>
          </div>
          <span
            className={`dashboard__status-dot ${
              isDbPersistent
                ? 'dashboard__status-dot--persistent'
                : 'dashboard__status-dot--volatile'
            }`}
            title={isDbPersistent ? '数据已持久化' : '数据仅在内存中'}
          />
        </div>
      </div>

      {/* ── Portfolio Overview ── */}
      <div className="dashboard__section">
        <div className="dashboard__overview glass-card">
          <div className="dashboard__overview-label">资产总览</div>
          <div className="dashboard__total-amount text-mono">
            ${formatCurrency(totalInvested)}
          </div>
          <div className={`dashboard__total-pnl dashboard__total-pnl--${pnlClass}`}>
            {pnlPrefix}${formatCurrency(totalPnl)}
          </div>

          <div className="dashboard__mini-stats">
            <div className="dashboard__mini-stat">
              <div className="dashboard__mini-stat-value text-mono">
                {holdingsCount}
              </div>
              <div className="dashboard__mini-stat-label">持仓数</div>
            </div>
            <div className="dashboard__mini-stat">
              <div className="dashboard__mini-stat-value text-mono">
                {tradesCount}
              </div>
              <div className="dashboard__mini-stat-label">交易数</div>
            </div>
            <div className="dashboard__mini-stat">
              <div className="dashboard__mini-stat-value text-mono">
                {decisionsCount}
              </div>
              <div className="dashboard__mini-stat-label">决策数</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Conversion Funnel / Decision Loop ── */}
      <div className="dashboard__section">
        <div className="dashboard__funnel glass-card">
          <div className="dashboard__overview-label">闭环漏斗</div>
          <div className="dashboard__funnel-stats">
            <div className="dashboard__funnel-step">
               <span className="text-mono">{stats?.info_count || 0}</span> 条信息
            </div>
            <div className="dashboard__funnel-arrow">→</div>
            <div className="dashboard__funnel-step">
               <span className="text-mono">{stats?.viewpoint_count || 0}</span> 个观点
            </div>
            <div className="dashboard__funnel-arrow">→</div>
            <div className="dashboard__funnel-step">
               <span className="text-mono">{stats?.decision_count || 0}</span> 个决策
            </div>
            <div className="dashboard__funnel-arrow">→</div>
            <div className="dashboard__funnel-step">
               <span className="text-mono">{stats?.trade_count || 0}</span> 笔交易
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Decisions ── */}
      <div className="dashboard__section">
        <div className="dashboard__holdings-header">
          <h2 className="dashboard__holdings-title">活跃决策</h2>
        </div>

        {activeDecisions.length > 0 ? (
          <div className="dashboard__decisions-scroll">
            {activeDecisions.map((d, index) => (
              <div key={d.id} className="dashboard__decision-wrapper">
                <DecisionCard decision={d} index={index} onClick={() => navigate('/decisions')} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🧠"
            title="暂无活跃决策"
            subtitle="开始构建你的投资逻辑"
          />
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div className="dashboard__section">
        <div className="dashboard__actions">
          <button
            className="dashboard__action-btn dashboard__action-btn--primary"
            onClick={() => navigate('/trades')}
          >
            <span className="dashboard__action-icon">📝</span>
            录入交易
          </button>
          <button
            className="dashboard__action-btn dashboard__action-btn--secondary"
            onClick={() => navigate('/decisions')}
          >
            <span className="dashboard__action-icon">🧠</span>
            新建决策
          </button>
        </div>
      </div>
    </div>
  );
}
