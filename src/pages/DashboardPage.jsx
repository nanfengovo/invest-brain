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

export default function DashboardPage() {
  const navigate = useNavigate();
  const { holdings, summary, stats, decisions, refreshHoldings, refreshDecisions } = useTradeStore();
  const { isDbPersistent } = useAppStore();

  useEffect(() => {
    refreshHoldings();
    refreshDecisions();
  }, [refreshHoldings, refreshDecisions]);

  const activeDecisions = decisions.filter(d => d.status !== 'CLOSED' && d.status !== 'ENDED');

  const totalInvested = Number(summary?.total_buys) || 0;
  const totalPnl = (Number(summary?.total_sells) || 0) - totalInvested;
  
  const infoCount = stats?.info_count ?? 1;
  const viewpointCount = stats?.viewpoint_count ?? 0;
  const decisionCount = stats?.decision_count ?? 2;
  const tradeCount = stats?.trade_count ?? 20;
  
  const winRate = stats?.win_rate ?? 50.0;
  const plRatio = stats?.pl_ratio ?? '--';
  const exposure = stats?.exposure ?? 1309.07;

  const isWarning = tradeCount > decisionCount;
  const strayTradesCount = Math.max(0, tradeCount - decisionCount);
  
  const pnlPrefix = totalPnl >= 0 ? '+' : '-';
  const pnlColor = totalPnl >= 0 ? 'var(--adm-color-success)' : 'var(--adm-color-danger)';

  // Premium card base style ensuring contrast against #0a0e17 background
  const cardStyle = {
    margin: '0 16px',
    background: 'rgba(30, 41, 59, 0.75)', // slightly brighter blue-gray for clear boundaries
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
  };

  return (
    <div className="w-full h-full flex flex-col gap-3 relative pb-16 safe-pt overflow-x-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      
      {/* Header */}
      <div className="flex justify-between items-center px-5 pb-2 relative z-10">
        <div className="flex flex-col">
          <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>交易分析 Agent</div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{formatDate()}</div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={{ backgroundColor: isDbPersistent ? 'var(--color-profit)' : 'var(--color-loss)', boxShadow: `0 0 8px ${isDbPersistent ? 'var(--color-profit)' : 'var(--color-loss)'}` }}></div>
          <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Local</div>
        </div>
      </div>

      {/* Module 1: Diagnostics */}
      <Card style={cardStyle} bodyStyle={{ padding: '16px' }}>
        <div className="flex gap-4 items-center">
          <div className="p-3 rounded-xl text-3xl font-bold flex flex-col items-center justify-center w-16 h-16 relative" style={{ background: 'var(--color-bg-primary)', color: 'var(--adm-color-success)', border: '1px solid rgba(0, 212, 170, 0.2)' }}>
            28
            <span className="text-[10px] font-normal mt-1 text-neutral-400">纪律分</span>
          </div>
          <div className="flex flex-col flex-1">
            <div className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>闭环缺口</div>
            <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              有 <span className="text-white font-medium">{strayTradesCount}</span> 笔交易未关联决策，优先补齐执行闭环。
            </div>
          </div>
        </div>
      </Card>

      {/* Module 2: Performance Grid */}
      <Card style={cardStyle} bodyStyle={{ padding: '16px' }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 mb-0.5">实战绩效</span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>账户表现</span>
          </div>
          <div className="text-xs font-medium px-2.5 py-1.5 rounded-full cursor-pointer" style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg)' }}>
            资产快照
          </div>
        </div>
        
        <div className="text-4xl font-bold tracking-tight mb-6" style={{ color: pnlColor }}>
          {pnlPrefix} <span className="text-2xl">$</span>{formatCurrency(Math.abs(totalPnl))}
        </div>
        
        <div className="flex justify-between items-center bg-black/20 rounded-xl p-3 border border-white/5">
          <div className="flex flex-col gap-1 w-1/3">
            <span className="text-[10px] text-neutral-400">胜率</span>
            <span className="text-sm font-bold text-white">{winRate}%</span>
          </div>
          <div className="w-[1px] h-8 bg-white/10 mx-2"></div>
          <div className="flex flex-col gap-1 w-1/3 pl-2">
            <span className="text-[10px] text-neutral-400">盈亏比</span>
            <span className="text-sm font-bold text-white">{plRatio}</span>
          </div>
          <div className="w-[1px] h-8 bg-white/10 mx-2"></div>
          <div className="flex flex-col gap-1 w-1/3 pl-2">
            <span className="text-[10px] text-neutral-400">当前敞口</span>
            <span className="text-sm font-bold text-white">${formatCurrency(exposure)}</span>
          </div>
        </div>
      </Card>

      {/* Module 3: Execution Funnel */}
      <Card style={cardStyle} bodyStyle={{ padding: '16px' }}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 mb-0.5">执行闭环</span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>决策执行漏斗</span>
          </div>
          <div className="text-[10px] font-medium px-2 py-1 rounded-full cursor-pointer" style={{ color: 'var(--adm-color-danger)', border: '1px solid var(--adm-color-danger)' }}>
            待复盘
          </div>
        </div>

        <div className="flex justify-between items-center mb-6 px-1">
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-[11px] text-neutral-400">情报</span>
            <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-lg font-bold text-white border border-white/5">{infoCount}</div>
          </div>
          <span className="text-neutral-600 text-xs mt-6">→</span>
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-[11px] text-neutral-400">观点</span>
            <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-lg font-bold text-white border border-white/5">{viewpointCount}</div>
          </div>
          <span className="text-neutral-600 text-xs mt-6">→</span>
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-[11px] text-neutral-400">决策</span>
            <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-lg font-bold text-white border border-white/5">{decisionCount}</div>
          </div>
          <span className="text-neutral-600 text-xs mt-6">→</span>
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-[11px] text-neutral-400">交易</span>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold ${isWarning ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30' : 'bg-black/30 text-white border border-white/5'}`}>
              {tradeCount}
            </div>
          </div>
        </div>

        {isWarning && (
          <div className="p-3 rounded-lg flex flex-col gap-1.5" style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
            <span className="text-xs font-semibold text-rose-500">异常交易提醒</span>
            <span className="text-[11px] text-rose-400/90 leading-relaxed">
              存在 {strayTradesCount} 笔游离交易未关联决策，建议先完成复盘再继续加仓。
            </span>
          </div>
        )}
      </Card>

      {/* Module 4: Active Decisions */}
      <div className="mx-4 mt-2 mb-4">
        <div className="text-xs font-medium mb-3 pl-1" style={{ color: 'var(--color-text-secondary)' }}>活跃决策追踪</div>
        {activeDecisions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeDecisions.map((d) => (
              <Card 
                key={d.id} 
                style={{ ...cardStyle, margin: 0, cursor: 'pointer' }} 
                bodyStyle={{ padding: '12px 16px' }}
                onClick={() => navigate('/decisions')}
                className="active:scale-[0.98] transition-transform"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded tracking-wide" style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg)' }}>
                      [👀 观望中]
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white tracking-wide truncate">
                    {d.title || `${d.symbol} 建仓决策`}
                  </div>
                  <div className="text-[10px] mt-1 text-neutral-400 flex justify-between items-center">
                    <span>关联交易: <span className="text-white">{d.trade_ids?.length || 0}</span> · {new Date(d.created_at || Date.now()).toLocaleDateString()}</span>
                    <span className="text-neutral-600">→</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card style={{ ...cardStyle, margin: 0 }} bodyStyle={{ padding: '12px 16px' }}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <span className="text-[10px] px-1.5 py-0.5 rounded tracking-wide" style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg)' }}>
                  [👀 观望中]
                </span>
              </div>
              <div className="text-sm font-semibold text-white tracking-wide truncate">
                NVDA 跌破 $100 建仓
              </div>
              <div className="text-[10px] mt-1 text-neutral-400 flex justify-between items-center">
                <span>关联情报: <span className="text-white">2</span> · 2天前</span>
                <span className="text-neutral-600">→</span>
              </div>
            </div>
          </Card>
        )}
      </div>

    </div>
  );
}
