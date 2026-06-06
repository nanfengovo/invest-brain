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
    <div className="bg-slate-950 min-h-screen pb-20 overflow-x-hidden flex flex-col gap-4 relative">
      
      {/* Background ambient glows for depth */}
      <div className="absolute top-0 left-0 w-full h-64 bg-indigo-500/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/3 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none"></div>

      {/* 顶部区域 (合理化顶部间距) */}
      <div className="flex justify-between items-center px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1 relative z-10">
        <div className="flex flex-col">
          <div className="text-2xl font-bold text-white tracking-tight">交易分析 Agent</div>
          <div className="text-xs text-slate-400 mt-1">{formatDate()}</div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-full border border-slate-700/50 backdrop-blur-md">
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_8px_currentColor] ${isDbPersistent ? 'bg-emerald-400 text-emerald-400' : 'bg-rose-400 text-rose-400'}`}></div>
          <div className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">Local</div>
        </div>
      </div>

      {/* 模块 1：Agent 诊断卡 */}
      <div className={`mx-4 p-4 flex gap-4 items-center ${glassCardClass} relative z-10`}>
        <div className="bg-slate-800/80 text-emerald-400 p-3 rounded-xl text-xl font-bold flex-shrink-0 font-mono flex items-center justify-center w-12 h-12 shadow-inner border border-slate-700/50">
          78
        </div>
        <div className="flex flex-col flex-1">
          <div className="text-sm text-white font-medium">交易人格：纪律严明型</div>
          <div className="text-xs text-amber-400/90 mt-1.5">⚠️ 最近两笔交易盈亏比偏低</div>
        </div>
      </div>

      {/* 模块 2：实战绩效卡 */}
      <div className={`mx-4 p-5 flex flex-col gap-5 mt-2 ${glassCardClass} relative z-10`}>
        <div className="flex justify-between items-center">
          <div className="text-sm font-medium text-slate-400">实战绩效</div>
          <div className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md cursor-pointer hover:bg-indigo-500/20 transition-colors">
            + 资产快照
          </div>
        </div>
        <div className={`${pnlColorClass} text-4xl font-bold tracking-tight drop-shadow-sm`}>
          {pnlPrefix}${formatCurrency(totalPnl)}
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-700/50 pt-3 border-t border-slate-700/30">
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">胜率</div>
            <div className="text-base text-white font-semibold font-mono">{winRate}%</div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">盈亏比</div>
            <div className="text-base text-white font-semibold font-mono">{plRatio}</div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">当前敞口</div>
            <div className="text-base text-white font-semibold font-mono">${formatCurrency(exposure)}</div>
          </div>
        </div>
      </div>

      {/* 模块 3：决策执行漏斗卡 */}
      <div className={`mx-4 p-5 mt-2 ${glassCardClass} relative z-10`}>
        <div className="text-sm font-medium text-slate-400 mb-5">决策执行漏斗</div>
        <div className="flex justify-between items-center">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px] text-slate-500">情报</div>
            <div className="text-lg text-white font-mono font-semibold">{infoCount}</div>
          </div>
          <div className="text-slate-600/70 text-sm">→</div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px] text-slate-500">观点</div>
            <div className="text-lg text-white font-mono font-semibold">{viewpointCount}</div>
          </div>
          <div className="text-slate-600/70 text-sm">→</div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px] text-slate-500">决策</div>
            <div className="text-lg text-white font-mono font-semibold">{decisionCount}</div>
          </div>
          <div className="text-slate-600/70 text-sm">→</div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="text-[11px] text-slate-500">交易</div>
            <div className={`text-lg font-mono font-semibold ${isWarning ? 'text-rose-400 drop-shadow-[0_0_4px_rgba(251,113,133,0.4)]' : 'text-white'}`}>{tradeCount}</div>
          </div>
        </div>
        {isWarning && (
          <div className="bg-rose-950/40 border border-rose-900/50 p-3.5 rounded-xl text-rose-300 text-xs mt-5 leading-relaxed backdrop-blur-md">
            ⚠️ <span className="font-medium">异常：</span>存在 <span className="text-rose-200 font-bold">{strayTradesCount}</span> 笔游离交易未关联决策，执行纪律出现严重偏差。
          </div>
        )}
      </div>

      {/* 模块 4：活跃决策 */}
      <div className="mx-4 mt-2 relative z-10">
        <div className="text-sm font-medium text-slate-400 mb-3 pl-1">活跃决策</div>
        {activeDecisions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeDecisions.map((d) => (
              <div 
                key={d.id} 
                className={`p-4 active:scale-[0.98] transition-transform cursor-pointer ${glassCardClass}`}
                onClick={() => navigate('/decisions')}
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center">
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/20 font-mono tracking-wide">
                      [👀 观望中]
                    </span>
                  </div>
                  <div className="text-sm text-white font-semibold line-clamp-1 mt-0.5 tracking-wide">
                    {d.title || `${d.symbol} 建仓决策`}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex justify-between items-center">
                    <span>已关联 <span className="text-slate-400 font-medium">{d.trade_ids?.length || 0}</span> 笔交易 · {new Date(d.created_at || Date.now()).toLocaleDateString()}</span>
                    <span className="text-slate-600">→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`p-4 ${glassCardClass}`}>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center">
                <span className="text-[10px] text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/20 font-mono tracking-wide">
                  [👀 观望中]
                </span>
              </div>
              <div className="text-sm text-white font-semibold line-clamp-1 mt-0.5 tracking-wide">
                NVDA 跌破 $100 建仓
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex justify-between items-center">
                <span>已关联 <span className="text-slate-400 font-medium">2</span> 条情报 · 2天前</span>
                <span className="text-slate-600">→</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
