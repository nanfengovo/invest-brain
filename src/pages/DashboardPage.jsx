import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
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
  const { holdings, summary, stats, decisions, refreshHoldings, refreshDecisions } = useTradeStore();
  const { isDbPersistent } = useAppStore();

  useEffect(() => {
    refreshHoldings();
    refreshDecisions();
  }, [refreshHoldings, refreshDecisions]);

  const activeDecisions = decisions.filter(
    d => !['CLOSED', 'ENDED', 'ABANDONED'].includes(d.status)
  );

  const totalInvested = Number(summary?.total_buys) || 0;
  const totalPnl = (Number(summary?.total_sells) || 0) - totalInvested;
  
  const infoCount = stats?.info_count ?? 0;
  const viewpointCount = stats?.viewpoint_count ?? 0;
  const decisionCount = stats?.decision_count ?? 0;
  const tradeCount = stats?.trade_count ?? 0;
  const linkedTradesCount = decisions.reduce(
    (total, decision) => total + (Number(decision.trade_count) || 0),
    0
  );
  const reviewedDecisions = decisions.filter(decision => decision.review_id);
  const winningDecisions = reviewedDecisions.filter(decision => decision.is_successful);
  const winningPnl = reviewedDecisions.reduce((total, decision) => {
    const pnl = Number(decision.result_pnl) || 0;
    return pnl > 0 ? total + pnl : total;
  }, 0);
  const losingPnl = reviewedDecisions.reduce((total, decision) => {
    const pnl = Number(decision.result_pnl) || 0;
    return pnl < 0 ? total + Math.abs(pnl) : total;
  }, 0);

  const winRate = reviewedDecisions.length
    ? `${((winningDecisions.length / reviewedDecisions.length) * 100).toFixed(1)}%`
    : '--';
  const plRatio = losingPnl > 0
    ? (winningPnl / losingPnl).toFixed(2)
    : '--';
  const exposure = holdings.reduce((total, item) => {
    const quantity = Number(item.total_quantity) || 0;
    const avgCost = Number(item.avg_cost) || 0;
    return total + quantity * avgCost;
  }, 0);

  const strayTradesCount = Math.max(0, tradeCount - linkedTradesCount);
  const isWarning = strayTradesCount > 0;
  const linkedTradeRate = tradeCount > 0 ? linkedTradesCount / tradeCount : null;
  const reviewRate = decisionCount > 0 ? reviewedDecisions.length / decisionCount : null;
  const disciplineScore = linkedTradeRate === null && reviewRate === null
    ? null
    : Math.round(((linkedTradeRate ?? 1) * 0.72 + (reviewRate ?? 0) * 0.28) * 100);
  const disciplineLabel = disciplineScore === null
    ? '等待数据'
    : disciplineScore >= 80
      ? '纪律稳定'
      : disciplineScore >= 60
        ? '执行待强化'
        : '闭环缺口';
  const disciplineText = disciplineScore === null
    ? '录入情报、决策或交易后，这里会显示真实闭环质量。'
    : isWarning
      ? `有 ${strayTradesCount} 笔交易未关联决策，优先补齐执行闭环。`
      : `已关联 ${linkedTradesCount} 笔交易，复盘覆盖 ${reviewedDecisions.length}/${decisionCount} 条决策。`;

  const pnlPrefix = totalPnl > 0 ? '+' : totalPnl < 0 ? '-' : '';
  const pnlStateClass = totalPnl >= 0 ? 'is-profit' : 'is-loss';

  const statusMap = {
    DRAFT: { label: '草稿', className: 'draft' },
    WATCH: { label: '观望中', className: 'watch' },
    ACTIVE: { label: '进行中', className: 'active' },
    ABANDONED: { label: '已放弃', className: 'abandoned' },
  };

  const metrics = [
    { label: '胜率', value: winRate },
    { label: '盈亏比', value: plRatio },
    { label: '当前敞口', value: `$${formatCurrency(exposure)}` },
  ];

  const funnelSteps = [
    { label: '情报', value: infoCount },
    { label: '观点', value: viewpointCount },
    { label: '决策', value: decisionCount },
    { label: '交易', value: tradeCount, warning: isWarning },
  ];

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-header__kicker">InvestBrain</p>
          <h1 className="dashboard-header__title">交易分析 Agent</h1>
          <p className="dashboard-header__date">{formatDate()}</p>
        </div>
        <div className={`dashboard-db ${isDbPersistent ? 'dashboard-db--ok' : 'dashboard-db--risk'}`}>
          <span className="dashboard-db__dot" aria-hidden="true" />
          <span>Local</span>
        </div>
      </header>

      <section className="dashboard-score glass-card" aria-label="交易纪律诊断">
        <div className={`dashboard-score__meter ${disciplineScore === null ? 'is-empty' : ''}`}>
          <span className="dashboard-score__value">{disciplineScore ?? '--'}</span>
          <span className="dashboard-score__label">纪律分</span>
        </div>
        <div className="dashboard-score__body">
          <div className="dashboard-score__topline">{disciplineLabel}</div>
          <p className="dashboard-score__text">{disciplineText}</p>
        </div>
      </section>

      <section className="dashboard-card dashboard-performance glass-card" aria-label="实战绩效">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-section-head__label">实战绩效</p>
            <h2 className="dashboard-section-head__title">账户表现</h2>
          </div>
          <button
            type="button"
            className="dashboard-section-head__action"
            onClick={() => navigate('/holdings')}
          >
            资产快照
          </button>
        </div>

        <div className={`dashboard-pnl ${pnlStateClass}`}>
          {pnlPrefix && <span className="dashboard-pnl__sign">{pnlPrefix}</span>}
          <span className="dashboard-pnl__currency">$</span>
          <span>{formatCurrency(Math.abs(totalPnl))}</span>
        </div>

        <div className="dashboard-metrics">
          {metrics.map((metric) => (
            <div className="dashboard-metric" key={metric.label}>
              <span className="dashboard-metric__label">{metric.label}</span>
              <strong className="dashboard-metric__value">{metric.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-card glass-card" aria-label="决策执行漏斗">
        <div className="dashboard-section-head dashboard-section-head--compact">
          <div>
            <p className="dashboard-section-head__label">执行闭环</p>
            <h2 className="dashboard-section-head__title">决策执行漏斗</h2>
          </div>
          {isWarning && <span className="dashboard-risk-pill">待复盘</span>}
        </div>

        <div className="dashboard-funnel">
          {funnelSteps.map((step, index) => (
            <div className="dashboard-funnel__group" key={step.label}>
              <div className={`dashboard-funnel__step ${step.warning ? 'is-warning' : ''}`}>
                <span className="dashboard-funnel__label">{step.label}</span>
                <strong className="dashboard-funnel__value">{step.value}</strong>
              </div>
              {index < funnelSteps.length - 1 && (
                <span className="dashboard-funnel__arrow" aria-hidden="true">→</span>
              )}
            </div>
          ))}
        </div>

        {isWarning && (
          <div className="dashboard-warning" role="status">
            <strong>异常交易提醒</strong>
            <span>存在 {strayTradesCount} 笔游离交易未关联决策，建议先完成复盘再继续加仓。</span>
          </div>
        )}
      </section>

      <section className="dashboard-decisions" aria-label="活跃决策">
        <div className="dashboard-section-head dashboard-section-head--outside">
          <div>
            <p className="dashboard-section-head__label">当前计划</p>
            <h2 className="dashboard-section-head__title">活跃决策</h2>
          </div>
          <button
            type="button"
            className="dashboard-link-button"
            onClick={() => navigate('/decisions')}
          >
            全部
          </button>
        </div>

        {activeDecisions.length > 0 ? (
          <div className="dashboard-decision-list">
            {activeDecisions.slice(0, 3).map((decision) => {
            const status = statusMap[decision.status] || statusMap.ACTIVE;
            const tradeCountLabel = decision.trade_count ?? 0;

            return (
              <button
                type="button"
                key={decision.id}
                className="dashboard-decision glass-card"
                onClick={() => navigate('/decisions')}
              >
                <span className={`dashboard-decision__status dashboard-decision__status--${status.className}`}>
                  {status.label}
                </span>
                <span className="dashboard-decision__title">
                  {decision.title || `${decision.symbol} 建仓决策`}
                </span>
                <span className="dashboard-decision__meta">
                  已关联 {tradeCountLabel} 笔交易 · {new Date(decision.created_at || Date.now()).toLocaleDateString('zh-CN')}
                </span>
                <span className="dashboard-decision__arrow" aria-hidden="true">→</span>
              </button>
            );
            })}
          </div>
        ) : (
          <button
            type="button"
            className="dashboard-empty glass-card"
            onClick={() => navigate('/decisions')}
          >
            <span className="dashboard-empty__title">暂无活跃决策</span>
            <span className="dashboard-empty__text">新建决策后，这里会显示正在观察或执行的计划。</span>
          </button>
        )}
      </section>
    </div>
  );
}
