import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { Card } from 'antd-mobile';
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

const DECISION_STATUS_LABELS = {
  DRAFT: '观点草稿',
  WATCH: '观望中',
  ACTIVE: '执行中',
  CLOSED: '已闭环',
  ENDED: '已结束',
  ABANDONED: '已放弃',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { summary, stats, decisions, refreshHoldings, refreshDecisions } = useTradeStore();
  const { isDbPersistent } = useAppStore();

  useEffect(() => {
    refreshHoldings();
    refreshDecisions();
  }, [refreshHoldings, refreshDecisions]);

  const activeDecisionPool = decisions.filter(d => !['CLOSED', 'ENDED', 'ABANDONED'].includes(d.status));
  const activeDecisions = activeDecisionPool.slice(0, 5);

  const totalInvested = Number(summary?.total_buys) || 0;
  const totalSells = Number(summary?.total_sells) || 0;
  const totalPnl = Number(summary?.realized_pnl) || 0;
  
  const infoCount = stats?.info_count ?? 0;
  const viewpointCount = stats?.viewpoint_count ?? 0;
  const decisionCount = stats?.decision_count ?? 0;
  const tradeCount = stats?.trade_count ?? 0;
  const reviewCount = stats?.review_count ?? 0;
  
  const winRate = reviewCount > 0 && typeof stats?.win_rate === 'number' ? `${stats.win_rate}%` : '待复盘';
  const plRatio = reviewCount > 0 && stats?.pl_ratio ? stats.pl_ratio : '待复盘';
  const exposure = Math.max(0, totalInvested - totalSells);

  const strayTradesCount = Math.max(0, tradeCount - decisionCount);
  const isWarning = strayTradesCount > 0;
  const hasDisciplineSample = tradeCount > 0 || decisionCount > 0;
  const closedTradeCount = Math.max(0, tradeCount - strayTradesCount);
  const disciplineScore = hasDisciplineSample
    ? Math.max(0, Math.round((closedTradeCount / Math.max(tradeCount, 1)) * 100))
    : null;
  const disciplineDisplay = disciplineScore === null ? '--' : disciplineScore;
  const disciplineTone = disciplineScore === null ? 'is-empty' : disciplineScore >= 80 ? 'is-good' : disciplineScore >= 60 ? 'is-watch' : 'is-risk';
  const closureCopy = !hasDisciplineSample
    ? '暂无交易样本，建立决策和交易后自动计算闭环纪律。'
    : isWarning
      ? `有 ${strayTradesCount} 笔交易未关联决策，优先补齐执行闭环。`
      : '当前没有未关联交易，执行闭环保持完整。';
  const funnelBadge = isWarning ? '待补齐' : tradeCount > 0 ? '已闭环' : '未开始';
  const funnelBadgeIcon = isWarning ? '!' : tradeCount > 0 ? '✓' : '·';
  const funnelFocusTitle = !hasDisciplineSample
    ? '等待第一笔闭环记录'
    : isWarning
      ? '交易缺少决策来源'
      : '交易链路完整';
  const funnelFocusCopy = !hasDisciplineSample
    ? '先沉淀情报、观点和决策，再记录交易执行。'
    : isWarning
      ? `${strayTradesCount} 笔交易还没有关联到决策，建议优先补齐来源。`
      : '当前交易都能追溯到对应决策，可以继续复盘沉淀。';
  const funnelSteps = [
    {
      label: '情报',
      value: infoCount,
      hint: '线索池',
      tone: infoCount > 0 ? 'filled' : 'empty',
    },
    {
      label: '观点',
      value: viewpointCount,
      hint: '判断',
      tone: viewpointCount > 0 ? 'filled' : 'empty',
    },
    {
      label: '决策',
      value: decisionCount,
      hint: '计划',
      tone: decisionCount > 0 ? 'filled' : 'empty',
    },
    {
      label: '交易',
      value: tradeCount,
      hint: isWarning ? `${strayTradesCount} 笔游离` : '执行',
      tone: isWarning ? 'risk' : tradeCount > 0 ? 'filled' : 'empty',
    },
  ];
  const activeDecisionCount = activeDecisionPool.length;
  const actionItems = [
    {
      label: '补齐闭环',
      value: strayTradesCount > 0 ? `${strayTradesCount} 笔` : '完成',
      hint: strayTradesCount > 0 ? '交易未关联决策' : '交易链路正常',
      route: '/trades',
      tone: strayTradesCount > 0 ? 'risk' : 'ok',
    },
    {
      label: '复盘队列',
      value: `${reviewCount} 条`,
      hint: reviewCount > 0 ? '已有复盘记录' : '暂无复盘记录',
      route: '/trades',
      tone: reviewCount > 0 ? 'ok' : 'neutral',
    },
    {
      label: '活跃决策',
      value: `${activeDecisionCount} 条`,
      hint: activeDecisionCount > 0 ? '持续跟踪中' : '暂无跟踪项',
      route: '/decisions',
      tone: activeDecisionCount > 0 ? 'accent' : 'neutral',
    },
    {
      label: '情报沉淀',
      value: `${infoCount} 条`,
      hint: infoCount > 0 ? '可继续提炼观点' : '暂无情报记录',
      route: '/information',
      tone: infoCount > 0 ? 'accent' : 'neutral',
    },
  ];

  const pnlPrefix = totalPnl > 0 ? '+' : totalPnl < 0 ? '-' : '';

  return (
    <div className="dashboard-shell">
      
      {/* Header */}
      <div className="dashboard-hero-header flex justify-between items-start relative z-10">
        <div className="dashboard-hero-copy flex flex-col">
          <div className="dashboard-hero-title text-2xl font-bold tracking-tight">交易分析 Agent</div>
          <div className="dashboard-hero-date text-xs mt-1">{formatDate()}</div>
        </div>
        <div
          className={`dashboard-local-badge ${isDbPersistent ? 'is-ok' : 'is-risk'}`}
          aria-label={isDbPersistent ? '数据已启用本地持久化保存' : '当前可能是临时存储状态'}
        >
          <span className="dashboard-local-badge__dot" />
          <span className="dashboard-local-badge__text">
            {isDbPersistent ? '本地保存' : '临时存储'}
          </span>
        </div>
      </div>

      {/* Module 1: Diagnostics */}
      <Card className="dashboard-home-card" bodyStyle={{ padding: '16px' }}>
        <div className="flex gap-4 items-center">
          <div className={`dashboard-discipline-meter ${disciplineTone} p-3 rounded-xl text-3xl font-bold flex flex-col items-center justify-center w-16 h-16 relative`}>
            {disciplineDisplay}
            <span className="text-[10px] font-normal mt-1">纪律分</span>
          </div>
          <div className="flex flex-col flex-1">
            <div className="dashboard-home-title text-base font-semibold">闭环缺口</div>
            <div className="dashboard-home-copy text-xs mt-1.5 leading-relaxed">
              {closureCopy}
            </div>
          </div>
        </div>
      </Card>

      {/* Module 2: Performance Grid */}
      <Card className="dashboard-home-card" bodyStyle={{ padding: '16px' }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <span className="dashboard-home-eyebrow text-[10px] mb-0.5">实战绩效</span>
            <span className="dashboard-home-title text-sm font-medium">账户表现</span>
          </div>
          <div className="dashboard-soft-pill text-xs font-medium px-2.5 py-1.5 rounded-full cursor-pointer">
            资产快照
          </div>
        </div>
        
        <div className={`dashboard-home-pnl text-4xl font-bold tracking-tight mb-6 ${totalPnl < 0 ? 'is-loss' : ''}`}>
          {pnlPrefix} <span className="text-2xl">$</span>{formatCurrency(Math.abs(totalPnl))}
        </div>
        
        <div className="dashboard-home-metrics">
          <div className="dashboard-metric-tile">
            <span className="dashboard-home-eyebrow text-[10px]">胜率</span>
            <span className="dashboard-metric-value text-sm font-bold">{winRate}</span>
            <span className="dashboard-metric-hint">复盘样本</span>
          </div>
          <div className="dashboard-metric-tile">
            <span className="dashboard-home-eyebrow text-[10px]">盈亏比</span>
            <span className="dashboard-metric-value text-sm font-bold">{plRatio}</span>
            <span className="dashboard-metric-hint">盈亏结构</span>
          </div>
          <div className="dashboard-metric-tile">
            <span className="dashboard-home-eyebrow text-[10px]">当前敞口</span>
            <span className="dashboard-metric-value text-sm font-bold">${formatCurrency(exposure)}</span>
            <span className="dashboard-metric-hint">买入 - 卖出</span>
          </div>
        </div>
      </Card>

      {/* Module 3: Execution Funnel */}
      <Card className="dashboard-home-card" bodyStyle={{ padding: '16px' }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <span className="dashboard-home-eyebrow text-[10px] mb-0.5">执行闭环</span>
            <span className="dashboard-home-title text-sm font-medium">决策执行漏斗</span>
          </div>
          <div
            className={`dashboard-risk-badge ${
              isWarning ? 'is-risk' : tradeCount > 0 ? 'is-calm' : 'is-idle'
            }`}
          >
            <span className="dashboard-risk-badge__icon">{funnelBadgeIcon}</span>
            <span>{funnelBadge}</span>
          </div>
        </div>

        <div className={`dashboard-closure-focus ${isWarning ? 'is-risk' : tradeCount > 0 ? 'is-calm' : 'is-idle'}`}>
          <div className="dashboard-closure-focus__copy">
            <span className="dashboard-closure-focus__label">当前断点</span>
            <strong>{funnelFocusTitle}</strong>
            <span>{funnelFocusCopy}</span>
          </div>
          <button
            className="dashboard-closure-focus__action"
            type="button"
            onClick={() => navigate(isWarning ? '/trades' : '/decisions')}
          >
            {isWarning ? '去补齐' : '看决策'}
          </button>
        </div>

        <div className="dashboard-flow-strip">
          {funnelSteps.map((step, index) => (
            <div key={step.label} className={`dashboard-flow-step is-${step.tone}`}>
              <div className="dashboard-flow-step__rail">
                <span className="dashboard-flow-step__dot" />
              </div>
              <span className="dashboard-flow-step__label">{step.label}</span>
              <strong>{step.value}</strong>
              <span className="dashboard-flow-step__hint">{step.hint}</span>
              {index < funnelSteps.length - 1 && <span className="dashboard-flow-step__connector" />}
            </div>
          ))}
        </div>
      </Card>

      {/* Module 4: Active Decisions */}
      <div className="dashboard-active-section mt-2 mb-4">
        <div className="dashboard-active-panel">
          <div className="dashboard-active-head">
            <div className="dashboard-active-title">
              <span className="dashboard-section-label text-xs font-medium">决策队列</span>
              <strong>活跃决策追踪</strong>
            </div>
            <button className="dashboard-inline-action" type="button" onClick={() => navigate('/decisions?new=1')}>
              新建
            </button>
          </div>
          {activeDecisions.length > 0 ? (
            <div className="dashboard-active-list">
              {activeDecisions.map((d) => (
                <button
                  key={d.id}
                  className="dashboard-decision-card"
                  type="button"
                  onClick={() => navigate('/decisions')}
                >
                  <div className="dashboard-decision-card__main">
                    <span className="dashboard-decision-chip">
                      {DECISION_STATUS_LABELS[d.status] || '跟踪中'} · 重要度 {d.priority || 3}
                    </span>
                    <span className="dashboard-decision-title">
                      {d.title || `${d.asset_symbol || d.asset_id || ''} 建仓决策`}
                    </span>
                    <span className="dashboard-decision-meta">
                      交易 <span className="dashboard-inline-strong">{d.trade_count || 0}</span>
                      {' '}· 证据 <span className="dashboard-inline-strong">{d.linked_info_count || 0}</span>
                      {' '}· {d.asset_symbol || d.asset_id || '未绑定'}
                    </span>
                  </div>
                  <span className="dashboard-decision-arrow">→</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              className="dashboard-active-empty"
              type="button"
              onClick={() => navigate('/decisions?new=1')}
            >
              <span className="dashboard-active-empty__mark">+</span>
              <span className="dashboard-active-empty__copy">
                <strong>暂无活跃决策</strong>
                <span>0 条执行中 · 可新建一条跟踪项</span>
              </span>
              <span className="dashboard-decision-arrow">→</span>
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-action-section">
        <div className="dashboard-section-label text-xs font-medium mb-3 pl-1">今日行动</div>
        <div className="dashboard-action-grid">
          {actionItems.map((item) => (
            <button
              key={item.label}
              className={`dashboard-action-tile dashboard-action-tile--${item.tone}`}
              onClick={() => navigate(item.route)}
            >
              <span className="dashboard-action-tile__label">{item.label}</span>
              <span className="dashboard-action-tile__value">{item.value}</span>
              <span className="dashboard-action-tile__hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
