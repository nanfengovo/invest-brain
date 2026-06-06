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

  return (
    <div className="bg-[#0B0E14] min-h-screen pb-24 overflow-x-hidden flex flex-col gap-4">
      
      {/* Block 1: 顶部导航 */}
      <div className="flex justify-between items-center px-4 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-2">
        <div className="flex flex-col">
          <div className="text-xl font-bold text-white">交易分析 Agent</div>
          <div className="text-xs text-gray-500 mt-1">{formatDate()}</div>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-full">
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDbPersistent ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
          <div className="text-[10px] text-gray-400">Local</div>
        </div>
      </div>

      {/* Block 2: Agent 诊断卡片 */}
      <div className="mx-4 p-4 rounded-2xl bg-[#141822] border border-white/[0.04] shadow-lg flex gap-4 items-center">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-emerald-400 font-mono text-lg font-bold flex-shrink-0">
          78
        </div>
        <div className="flex flex-col flex-1">
          <div className="text-sm text-white font-medium">交易人格：纪律严明型</div>
          <div className="text-xs text-gray-400 mt-1">⚠️ 最近两笔交易盈亏比偏低</div>
        </div>
      </div>

      {/* Block 3: 核心绩效面板 */}
      <div className="mx-4 p-5 rounded-2xl bg-[#141822] border border-white/[0.04] shadow-lg flex flex-col gap-5">
        <div className="flex justify-between">
          <div className="text-sm text-gray-400">实战绩效</div>
          <div className="text-xs text-blue-400 cursor-pointer">+ 资产快照</div>
        </div>
        <div className={`${pnlColorClass} text-4xl font-bold tracking-tight`}>
          {pnlPrefix}${formatCurrency(totalPnl)}
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/10">
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] text-gray-500">胜率</div>
            <div className="text-base text-white font-medium">{winRate}%</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] text-gray-500">盈亏比</div>
            <div className="text-base text-white font-medium">{plRatio}</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] text-gray-500">当前敞口</div>
            <div className="text-base text-white font-medium">${formatCurrency(exposure)}</div>
          </div>
        </div>
      </div>

      {/* Block 4: 漏斗与预警 */}
      <div className="mx-4 p-5 rounded-2xl bg-[#141822] border border-white/[0.04] shadow-lg">
        <div className="text-sm text-gray-400 mb-4">决策执行漏斗</div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col items-center gap-1 flex-1">
            <div className="text-xs text-gray-500">情报</div>
            <div className="text-lg text-white font-mono">{infoCount}</div>
          </div>
          <div className="text-gray-700">→</div>
          <div className="flex flex-col items-center gap-1 flex-1">
            <div className="text-xs text-gray-500">观点</div>
            <div className="text-lg text-white font-mono">{viewpointCount}</div>
          </div>
          <div className="text-gray-700">→</div>
          <div className="flex flex-col items-center gap-1 flex-1">
            <div className="text-xs text-gray-500">决策</div>
            <div className="text-lg text-white font-mono">{decisionCount}</div>
          </div>
          <div className="text-gray-700">→</div>
          <div className="flex flex-col items-center gap-1 flex-1">
            <div className="text-xs text-gray-500">交易</div>
            <div className={`text-lg font-mono ${isWarning ? 'text-rose-400' : 'text-white'}`}>{tradeCount}</div>
          </div>
        </div>
        {isWarning && (
          <div className="w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 leading-relaxed">
            ⚠️ 异常：存在 {strayTradesCount} 笔游离交易未关联决策，执行纪律出现严重偏差。
          </div>
        )}
      </div>

      {/* Block 5: 活跃决策 (额外补充一致性设计) */}
      <div className="mx-4 mt-2">
        <div className="text-sm text-gray-400 mb-3 pl-1">活跃决策</div>
        {activeDecisions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeDecisions.map((d) => (
              <div 
                key={d.id} 
                className="p-4 rounded-2xl bg-[#141822] border border-white/[0.04] shadow-lg active:scale-[0.98] transition-transform cursor-pointer"
                onClick={() => navigate('/decisions')}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                      [👀 观望中]
                    </span>
                  </div>
                  <div className="text-sm text-white font-medium line-clamp-1 mt-1">
                    {d.title || `${d.symbol} 建仓决策`}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-2 flex justify-between items-center">
                    <span>已关联 {d.trade_ids?.length || 0} 笔交易 · {new Date(d.created_at || Date.now()).toLocaleDateString()}</span>
                    <span className="text-gray-600">→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-[#141822] border border-white/[0.04] shadow-lg">
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                  [👀 观望中]
                </span>
              </div>
              <div className="text-sm text-white font-medium line-clamp-1 mt-1">
                NVDA 跌破 $100 建仓
              </div>
              <div className="text-[11px] text-gray-500 mt-2 flex justify-between items-center">
                <span>已关联 2 条情报 · 2天前</span>
                <span className="text-gray-600">→</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
