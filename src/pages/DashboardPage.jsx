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
    <div className="bg-slate-950 min-h-screen pb-24 overflow-x-hidden flex flex-col gap-4">
      
      {/* 顶部区域 */}
      <div className="flex justify-between items-center px-4 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-2">
        <div className="flex flex-col">
          <div className="text-2xl font-bold text-white">交易分析 Agent</div>
          <div className="text-xs text-gray-500 mt-1">{formatDate()}</div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-full border border-slate-700">
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDbPersistent ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
          <div className="text-[10px] text-gray-400">Local</div>
        </div>
      </div>

      {/* 模块 1：Agent 诊断卡 */}
      <div className="mx-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 flex gap-4 items-center">
        <div className="bg-slate-800 text-emerald-400 p-3 rounded-lg text-xl font-bold flex-shrink-0 font-mono flex items-center justify-center w-12 h-12">
          78
        </div>
        <div className="flex flex-col flex-1">
          <div className="text-sm text-white font-medium">交易人格：纪律严明型</div>
          <div className="text-xs text-amber-500 mt-1">⚠️ 最近两笔交易盈亏比偏低</div>
        </div>
      </div>

      {/* 模块 2：实战绩效卡 */}
      <div className="mx-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-5 mt-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-400">实战绩效</div>
          <div className="text-xs text-blue-400 cursor-pointer">+ 资产快照</div>
        </div>
        <div className={`${pnlColorClass} text-4xl font-bold tracking-tight`}>
          {pnlPrefix}${formatCurrency(totalPnl)}
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-700 pt-2">
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

      {/* 模块 3：决策执行漏斗卡 */}
      <div className="mx-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 mt-4">
        <div className="text-sm text-gray-400 mb-4">决策执行漏斗</div>
        <div className="flex justify-between items-center">
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
          <div className="bg-rose-950 p-3 rounded-lg text-rose-300 text-xs mt-4 leading-relaxed">
            ⚠️ 异常：存在 {strayTradesCount} 笔游离交易未关联决策，执行纪律出现严重偏差。
          </div>
        )}
      </div>

      {/* 模块 4：活跃决策 */}
      <div className="mx-4 mt-4">
        <div className="text-sm text-gray-400 mb-3 pl-1">活跃决策</div>
        {activeDecisions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeDecisions.map((d) => (
              <div 
                key={d.id} 
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 active:scale-[0.98] transition-transform cursor-pointer"
                onClick={() => navigate('/decisions')}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <span className="text-[10px] text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-900 font-mono">
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
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <span className="text-[10px] text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-900 font-mono">
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
