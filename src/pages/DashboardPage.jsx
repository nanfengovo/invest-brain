import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';

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
  
  const winRate = stats?.win_rate ?? 65.2;
  const plRatio = stats?.pl_ratio ?? 1.8;
  const exposure = stats?.exposure ?? 5200;

  const isWarning = tradeCount > decisionCount;
  const strayTradesCount = Math.max(0, tradeCount - decisionCount);
  
  const pnlColorClass = totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
  const pnlPrefix = totalPnl >= 0 ? '+' : '';

  // Safe gradient glassmorphism base class
  const glassCardClass = "rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-900/80 backdrop-blur-xl border border-slate-700/50 shadow-lg shadow-black/20";

  return (
    <div className="min-h-screen pb-20 overflow-x-hidden flex flex-col gap-4 relative" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      
      {/* 顶部区域 (合理化顶部间距) */}
      <div className="flex justify-between items-center px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-1 relative z-10">
        <div className="flex flex-col">
          <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>交易分析 Agent</div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{formatDate()}</div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={{ backgroundColor: isDbPersistent ? 'var(--color-profit)' : 'var(--color-loss)', boxShadow: `0 0 8px ${isDbPersistent ? 'var(--color-profit)' : 'var(--color-loss)'}` }}></div>
          <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Local</div>
        </div>
      </div>

      {/* 模块 1：Agent 诊断卡 */}
      <div className="mx-4 flex gap-4 items-center glass-card relative z-10">
        <div className="p-3 rounded-xl text-xl font-bold flex-shrink-0 font-mono flex items-center justify-center w-12 h-12" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-profit)', border: '1px solid var(--color-border)' }}>
          78
        </div>
        <div className="flex flex-col flex-1">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>交易人格：纪律严明型</div>
          <div className="text-xs mt-1.5" style={{ color: 'var(--adm-color-warning)' }}>⚠️ 最近两笔交易盈亏比偏低</div>
        </div>
      </div>

      {/* 模块 2：实战绩效卡 */}
      <div className="mx-4 flex flex-col gap-5 mt-2 glass-card relative z-10">
        <div className="flex justify-between items-center">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>实战绩效</div>
          <div className="text-xs font-medium px-2 py-1 rounded-md cursor-pointer" style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg)' }}>
            + 资产快照
          </div>
        </div>
        <div className="text-4xl font-bold tracking-tight" style={{ color: totalPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
          {pnlPrefix}${formatCurrency(totalPnl)}
        </div>
        <div className="grid grid-cols-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex flex-col items-center gap-1.5" style={{ borderRight: '1px solid var(--color-border)' }}>
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>胜率</div>
            <div className="text-base font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>{winRate}%</div>
          </div>
          <div className="flex flex-col items-center gap-1.5" style={{ borderRight: '1px solid var(--color-border)' }}>
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>盈亏比</div>
            <div className="text-base font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>{plRatio}</div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>当前敞口</div>
            <div className="text-base font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>${formatCurrency(exposure)}</div>
          </div>
        </div>
      </div>

      {/* 模块 3：决策执行漏斗卡 */}
      <div className="mx-4 mt-2 glass-card relative z-10">
        <div className="text-sm font-medium mb-5" style={{ color: 'var(--color-text-secondary)' }}>决策执行漏斗</div>
        <div className="flex justify-between items-center">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>情报</div>
            <div className="text-lg font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{infoCount}</div>
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>→</div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>观点</div>
            <div className="text-lg font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{viewpointCount}</div>
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>→</div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>决策</div>
            <div className="text-lg font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{decisionCount}</div>
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>→</div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>交易</div>
            <div className={`text-lg font-mono font-semibold`} style={{ color: isWarning ? 'var(--color-loss)' : 'var(--color-text-primary)', textShadow: isWarning ? '0 0 4px var(--color-loss-glow)' : 'none' }}>{tradeCount}</div>
          </div>
        </div>
        {isWarning && (
          <div className="p-3.5 rounded-xl text-xs mt-5 leading-relaxed backdrop-blur-md" style={{ background: 'var(--color-loss-bg)', border: '1px solid var(--color-loss-glow)', color: 'var(--color-loss)' }}>
            ⚠️ <span className="font-medium">异常：</span>存在 <span className="font-bold">{strayTradesCount}</span> 笔游离交易未关联决策，执行纪律出现严重偏差。
          </div>
        )}
      </div>

      {/* 模块 4：活跃决策 */}
      <div className="mx-4 mt-2 relative z-10">
        <div className="text-sm font-medium mb-3 pl-1" style={{ color: 'var(--color-text-secondary)' }}>活跃决策</div>
        {activeDecisions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeDecisions.map((d) => (
              <div 
                key={d.id} 
                className="active:scale-[0.98] transition-transform cursor-pointer glass-card"
                onClick={() => navigate('/decisions')}
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center">
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono tracking-wide" style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                      [👀 观望中]
                    </span>
                  </div>
                  <div className="text-sm font-semibold line-clamp-1 mt-0.5 tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
                    {d.title || `${d.symbol} 建仓决策`}
                  </div>
                  <div className="text-[11px] mt-1 flex justify-between items-center" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>已关联 <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{d.trade_ids?.length || 0}</span> 笔交易 · {new Date(d.created_at || Date.now()).toLocaleDateString()}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center">
                <span className="text-[10px] px-2 py-0.5 rounded font-mono tracking-wide" style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  [👀 观望中]
                </span>
              </div>
              <div className="text-sm font-semibold line-clamp-1 mt-0.5 tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
                NVDA 跌破 $100 建仓
              </div>
              <div className="text-[11px] mt-1 flex justify-between items-center" style={{ color: 'var(--color-text-secondary)' }}>
                <span>已关联 <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>2</span> 条情报 · 2天前</span>
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
