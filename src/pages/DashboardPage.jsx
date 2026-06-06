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
  const totalPnl = totalSells - totalInvested;
  
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
        <div className={`dashboard-local-badge flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ${isDbPersistent ? 'is-ok' : 'is-risk'}`}>
          <div className="dashboard-local-badge__dot w-1.5 h-1.5 rounded-full animate-pulse" />
          <div className="text-[10px] font-medium uppercase tracking-wider">Local</div>
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
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col">
            <span className="dashboard-home-eyebrow text-[10px] mb-0.5">执行闭环</span>
            <span className="dashboard-home-title text-sm font-medium">决策执行漏斗</span>
          </div>
          <div className={`dashboard-risk-badge ${isWarning ? 'is-risk' : 'is-calm'} text-[10px] font-medium px-2 py-1 rounded-full cursor-pointer`}>
            {funnelBadge}
          </div>
        </div>

        <div className="flex justify-between items-center mb-6 px-1">
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="dashboard-home-eyebrow text-[11px]">情报</span>
            <div className="dashboard-funnel-box w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold">{infoCount}</div>
          </div>
          <span className="dashboard-funnel-arrow text-xs mt-6">→</span>
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="dashboard-home-eyebrow text-[11px]">观点</span>
            <div className="dashboard-funnel-box w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold">{viewpointCount}</div>
          </div>
          <span className="dashboard-funnel-arrow text-xs mt-6">→</span>
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="dashboard-home-eyebrow text-[11px]">决策</span>
            <div className="dashboard-funnel-box w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold">{decisionCount}</div>
          </div>
          <span className="dashboard-funnel-arrow text-xs mt-6">→</span>
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="dashboard-home-eyebrow text-[11px]">交易</span>
            <div className={`dashboard-funnel-box w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold ${isWarning ? 'is-warning' : ''}`}>
              {tradeCount}
            </div>
          </div>
        </div>

        {isWarning && (
          <div className="dashboard-home-warning p-3 rounded-lg flex flex-col gap-1.5">
            <span className="text-xs font-semibold">异常交易提醒</span>
            <span className="text-[11px] leading-relaxed">
              存在 {strayTradesCount} 笔游离交易未关联决策，建议先完成复盘再继续加仓。
            </span>
          </div>
        )}
      </Card>

      {/* Module 4: Active Decisions */}
      <div className="dashboard-active-section mt-2 mb-4">
        <div className="dashboard-active-head">
          <div className="dashboard-section-label text-xs font-medium">活跃决策追踪</div>
          <button className="dashboard-inline-action" onClick={() => navigate('/decisions?new=1')}>新建决策</button>
        </div>
        {activeDecisions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeDecisions.map((d) => (
              <Card 
                key={d.id} 
                className="dashboard-home-card dashboard-home-card--flush dashboard-decision-card"
                bodyStyle={{ padding: '12px 16px' }}
                onClick={() => navigate('/decisions')}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <span className="dashboard-decision-chip text-[10px] px-1.5 py-0.5 rounded tracking-wide">
                      {DECISION_STATUS_LABELS[d.status] || '跟踪中'} · 重要度 {d.priority || 3}
                    </span>
                  </div>
                  <div className="dashboard-decision-title text-sm font-semibold tracking-wide truncate">
                    {d.title || `${d.asset_symbol || d.asset_id || ''} 建仓决策`}
                  </div>
                  <div className="dashboard-decision-meta text-[10px] mt-1 flex justify-between items-center">
                    <span>
                      交易 <span className="dashboard-inline-strong">{d.trade_count || 0}</span>
                      {' '}· 证据 <span className="dashboard-inline-strong">{d.linked_info_count || 0}</span>
                      {' '}· {d.asset_symbol || d.asset_id || '未绑定'}
                    </span>
                    <span className="dashboard-decision-arrow">→</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="dashboard-home-card dashboard-home-card--flush" bodyStyle={{ padding: '12px 16px' }}>
            <div className="dashboard-empty-decision">
              <div>
                <div className="dashboard-decision-title text-sm font-semibold">暂无活跃决策</div>
                <div className="dashboard-decision-meta text-[10px] mt-1">新建决策后会在这里持续跟踪执行状态。</div>
              </div>
              <button className="dashboard-inline-action" onClick={() => navigate('/decisions?new=1')}>新建</button>
            </div>
          </Card>
        )}
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
