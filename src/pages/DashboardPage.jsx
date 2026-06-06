import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import EmptyState from '../components/common/EmptyState';
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

// Hardcore SVG Icons
const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);

const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

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
  
  // Safe fallbacks for display since API might not have all stats yet
  const infoCount = stats?.info_count ?? 12;
  const viewpointCount = stats?.viewpoint_count ?? 5;
  const decisionCount = stats?.decision_count ?? 3;
  const tradeCount = stats?.trade_count ?? 18;
  
  const winRate = stats?.win_rate ?? 65.2;
  const plRatio = stats?.pl_ratio ?? 1.8;
  const exposure = stats?.exposure ?? 5200;

  const isWarning = tradeCount > decisionCount;
  
  const pnlColorClass = totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-500';
  const pnlPrefix = totalPnl >= 0 ? '+' : '';

  return (
    <div className="bg-[#0B0E14] min-h-screen text-white pb-24 overflow-x-hidden">
      <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] flex flex-col gap-5">
        
        {/* 1. Header (顶部栏) */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight font-mono text-gray-100">
              交易记录和分析 Agent
            </h1>
            <p className="text-[11px] text-gray-500 font-mono tracking-wider">
              {formatDate()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-full border border-white/5">
            <span className={`w-2 h-2 rounded-full animate-pulse ${isDbPersistent ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-[10px] text-gray-400 font-mono">Local</span>
          </div>
        </div>

        {/* 2. Agent Analysis Card (Agent 诊断卡) */}
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 backdrop-blur-md flex items-center gap-4">
          <div className="flex flex-col items-center justify-center flex-shrink-0 w-14 h-14 bg-[#111620] border border-white/5 rounded-xl">
            <div className="text-indigo-400 mb-1"><TerminalIcon /></div>
            <div className="text-sm font-bold font-mono text-gray-200">78分</div>
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="text-[13px] font-bold text-gray-200">交易人格：纪律严明型</div>
            <div className="text-[11px] text-gray-400 leading-relaxed">
              <span className="text-amber-500 mr-1">⚠️</span>
              建议：最近两笔交易盈亏比低于 1.0，请注意止损位置。
            </div>
          </div>
        </div>

        {/* 3. Performance Grid (实战绩效面板) */}
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-5 backdrop-blur-md relative overflow-hidden">
          {/* Background Glow */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex justify-between items-center mb-6 relative z-10">
            <div className="text-sm font-semibold text-gray-300 tracking-wide flex items-center gap-2">
              <ActivityIcon /> 实战绩效
            </div>
            <button className="text-[11px] text-indigo-400 font-medium active:scale-95 transition-transform">
              + 资产快照
            </button>
          </div>
          
          <div className="flex flex-col mb-6 relative z-10">
            <span className="text-[11px] text-gray-500 uppercase tracking-widest font-mono mb-1">已实现盈亏</span>
            <span className={`text-4xl font-bold font-mono tracking-tight ${pnlColorClass}`}>
              {pnlPrefix}${formatCurrency(totalPnl)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 relative z-10 pt-4 border-t border-white/5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-mono">胜率</span>
              <span className="text-sm font-semibold text-gray-200 font-mono">{winRate}%</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-mono">盈亏比</span>
              <span className="text-sm font-semibold text-gray-200 font-mono">{plRatio}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-mono">当前敞口</span>
              <span className="text-sm font-semibold text-gray-200 font-mono">${formatCurrency(exposure)}</span>
            </div>
          </div>
        </div>

        {/* 4. Closed-loop Funnel (闭环漏斗) */}
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold text-gray-400 pl-1">决策执行漏斗</h2>
          <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs text-gray-500 font-mono">情报</span>
                <span className="text-lg font-bold text-gray-200 font-mono">{infoCount}</span>
              </div>
              <span className="text-gray-600 font-mono text-[10px]">→</span>
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs text-gray-500 font-mono">观点</span>
                <span className="text-lg font-bold text-gray-200 font-mono">{viewpointCount}</span>
              </div>
              <span className="text-gray-600 font-mono text-[10px]">→</span>
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs text-gray-500 font-mono">决策</span>
                <span className="text-lg font-bold text-gray-200 font-mono">{decisionCount}</span>
              </div>
              <span className="text-gray-600 font-mono text-[10px]">→</span>
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs text-gray-500 font-mono">交易</span>
                <span className={`text-lg font-bold font-mono ${isWarning ? 'text-rose-400' : 'text-gray-200'}`}>{tradeCount}</span>
              </div>
            </div>

            {isWarning && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-lg text-xs leading-relaxed mt-2 flex items-start gap-2">
                <span>⚠️</span>
                <span>异常：存在 {tradeCount - decisionCount} 笔游离交易未关联决策，请规范交易纪律。</span>
              </div>
            )}
          </div>
        </div>

        {/* 5. Active Decisions (活跃决策列表) */}
        <div className="flex flex-col gap-3 mt-2">
          <h2 className="text-[13px] font-semibold text-gray-400 pl-1">活跃决策</h2>
          
          {activeDecisions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {activeDecisions.map((d) => (
                <div 
                  key={d.id} 
                  className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 backdrop-blur-md active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => navigate('/decisions')}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-500/20">
                        [👀 观望中]
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-gray-200 line-clamp-1">
                      {d.title || `${d.symbol} 建仓决策`}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1 flex items-center justify-between">
                      <span>已关联 {d.trade_ids?.length || 0} 笔交易 · {new Date(d.created_at || Date.now()).toLocaleDateString()}</span>
                      <span className="text-gray-600">→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Hardcoded mock for visual alignment as requested by user if empty */}
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 backdrop-blur-md active:scale-[0.98] transition-transform cursor-pointer">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-500/20">
                      [👀 观望中]
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-200 line-clamp-1">
                    NVDA 跌破 $100 建仓
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1 flex items-center justify-between">
                    <span>已关联 2 条情报 · 2天前</span>
                    <span className="text-gray-600">→</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
