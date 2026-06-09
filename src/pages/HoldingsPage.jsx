import { useState, useEffect, useCallback } from 'react';
import { Toast } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
import EmptyState from '../components/common/EmptyState';
import HoldingCard from '../components/Holdings/HoldingCard';
import { parseOptionAlertInput } from '../utils/optionMonitoring';
import { getTradeOptionDisplay } from '../utils/tradeLifecycle';
import { buildOCCContractSymbol } from '../utils/optionsMarket';
import { syncCloudAlerts } from '../utils/cloudAlerts';
import './HoldingsPage.css';

const formatCurrency = (num) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const buildMarketDataHeaders = (marketDataConfig = {}) => ({
  ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
  ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
  ...(marketDataConfig.marketDataToken ? { 'X-MarketData-Token': marketDataConfig.marketDataToken } : {}),
  ...(marketDataConfig.longbridgeAppKey ? { 'X-Longbridge-App-Key': marketDataConfig.longbridgeAppKey } : {}),
  ...(marketDataConfig.longbridgeAppSecret ? { 'X-Longbridge-App-Secret': marketDataConfig.longbridgeAppSecret } : {}),
  ...(marketDataConfig.longbridgeAccessToken ? { 'X-Longbridge-Access-Token': marketDataConfig.longbridgeAccessToken } : {}),
});

const getHoldingOptionContract = (holding) => {
  const display = getTradeOptionDisplay({
    asset_type: 'OPTION',
    symbol: holding.symbol,
    underlying_symbol: holding.underlying_symbol,
    strike_price: holding.strike_price,
    expiry_date: holding.expiry_date,
    option_type: holding.option_type,
    contract_symbol: holding.contract_symbol || holding.asset_id,
  });

  return display?.contractSymbol
    || buildOCCContractSymbol({
      underlying: holding.underlying_symbol || holding.symbol,
      expiration: holding.expiry_date,
      optionType: holding.option_type,
      strike: holding.strike_price,
    })
    || String(holding.asset_id || '').replace(/^OPTION_/i, '').trim().toUpperCase();
};

export default function HoldingsPage() {
  const { holdings, summary, holdingsLoading, refreshHoldings } =
    useTradeStore();
  const workspaceScope = useAppStore((s) => s.workspaceScope);
  const notificationConfig = useAppStore((s) => s.notificationConfig);
  const marketDataConfig = useAppStore((s) => s.marketDataConfig);
  const isTeamWorkspace = workspaceScope === 'team';

  const [expandedId, setExpandedId] = useState(null);
  const [expandedTrades, setExpandedTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('ib_holdings_view_mode') || 'compact';
    } catch {
      return 'compact';
    }
  });
  const [authors, setAuthors] = useState([]);
  const [authorSearch, setAuthorSearch] = useState('');
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [underlyingQuotes, setUnderlyingQuotes] = useState({});
  const [optionQuotes, setOptionQuotes] = useState({});

  const activeAuthor = selectedAuthor || null;
  const filteredAuthors = authors.filter((author) =>
    author.toLowerCase().includes(authorSearch.trim().toLowerCase())
  );

  useEffect(() => {
    setSelectedAuthor('');
    setAuthorSearch('');
    setExpandedId(null);
    setExpandedTrades([]);
  }, [workspaceScope]);

  useEffect(() => {
    refreshHoldings(activeAuthor, workspaceScope);
  }, [activeAuthor, refreshHoldings, workspaceScope]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnderlyingQuotes() {
      const symbols = Array.from(new Set(
        holdings
          .filter((holding) => String(holding.type || '').toUpperCase() === 'OPTION')
          .map((holding) => String(holding.underlying_symbol || holding.symbol || '').trim().toUpperCase())
          .filter(Boolean)
      ));

      if (symbols.length === 0) {
        setUnderlyingQuotes({});
        return;
      }

      try {
        const res = await fetch(`/api/market?symbols=${encodeURIComponent(symbols.join(','))}`);
        const json = await res.json();
        if (cancelled) return;
        const nextQuotes = {};
        symbols.forEach((symbol) => {
          const item = json?.data?.[symbol];
          const price = Number(item?.displayPrice ?? item?.price);
          if (Number.isFinite(price)) {
            nextQuotes[symbol] = price;
          }
        });
        setUnderlyingQuotes(nextQuotes);
      } catch (err) {
        console.warn('Failed to load option underlying quotes:', err);
      }
    }

    loadUnderlyingQuotes();
    return () => {
      cancelled = true;
    };
  }, [holdings]);

  useEffect(() => {
    let cancelled = false;
    async function loadOptionQuotes() {
      const optionHoldings = holdings.filter((holding) => String(holding.type || '').toUpperCase() === 'OPTION');
      const candidates = optionHoldings
        .map((holding) => {
          const underlying = String(holding.underlying_symbol || holding.symbol || '').trim().toUpperCase();
          const contract = getHoldingOptionContract(holding);
          if (!underlying || !contract) return null;
          return {
            key: `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`,
            underlying,
            contract,
          };
        })
        .filter(Boolean);

      if (!candidates.length) {
        setOptionQuotes({});
        return;
      }

      try {
        const headers = buildMarketDataHeaders(marketDataConfig);
        const entries = await Promise.all(candidates.map(async (candidate) => {
          const params = new URLSearchParams({
            symbol: candidate.underlying,
            provider: marketDataConfig.optionProvider || 'auto',
            contract: candidate.contract,
          });
          const res = await fetch(`/api/options-chain?${params.toString()}`, { headers });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || '期权报价加载失败');
          const quote = json?.options?.[0] || null;
          return [candidate.key, quote ? { ...quote, provider: json.provider || quote.provider, generatedAt: json.generatedAt } : null];
        }));
        if (cancelled) return;
        setOptionQuotes(Object.fromEntries(entries.filter(([, quote]) => quote)));
      } catch (err) {
        console.warn('Failed to load option holding quotes:', err);
        if (!cancelled) setOptionQuotes({});
      }
    }

    loadOptionQuotes();
    const timer = window.setInterval(loadOptionQuotes, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [holdings, marketDataConfig]);

  useEffect(() => {
    let cancelled = false;
    async function loadAuthors() {
      try {
        const rows = await db.getTradeAuthors(workspaceScope);
        if (!cancelled) {
          setAuthors(rows.map((row) => row.author).filter(Boolean));
        }
      } catch (err) {
        console.error('Failed to load trade authors:', err);
      }
    }
    loadAuthors();
    return () => {
      cancelled = true;
    };
  }, [holdings.length, workspaceScope]);

  const handleToggle = useCallback(
    async (assetId, broker, groupAuthor) => {
      const queryAuthor = activeAuthor || groupAuthor || null;
      const key = `${assetId}-${broker || ''}-${queryAuthor || 'ALL'}`;
      if (expandedId === key) {
        setExpandedId(null);
        setExpandedTrades([]);
        return;
      }
      setExpandedId(key);
      setTradesLoading(true);
      try {
        const trades = await db.getTradesByAssetAndBroker(assetId, broker, queryAuthor, workspaceScope);
        setExpandedTrades(trades);
      } catch (err) {
        console.error('Failed to load trades for asset:', err);
        setExpandedTrades([]);
      } finally {
        setTradesLoading(false);
      }
    },
    [activeAuthor, expandedId, workspaceScope]
  );

  const handleViewModeChange = (nextMode) => {
    setViewMode(nextMode);
    try {
      localStorage.setItem('ib_holdings_view_mode', nextMode);
    } catch {
      // Ignore storage failures; the current session still updates.
    }
  };

  const handleAddOptionAlert = async (holding) => {
    if (isTeamWorkspace) {
      Toast.show({ content: '团队工作区是只读镜像，请先切换到个人工作区再设置提醒' });
      return;
    }

    const optionDisplay = getTradeOptionDisplay({
      asset_type: 'OPTION',
      symbol: holding.symbol,
      underlying_symbol: holding.underlying_symbol,
      strike_price: holding.strike_price,
      expiry_date: holding.expiry_date,
      option_type: holding.option_type,
      contract_symbol: holding.contract_symbol || holding.asset_id,
    });
    const title = optionDisplay?.title || holding.symbol || holding.asset_id;
    const defaultTarget = Number(holding.avg_cost);
    const input = window.prompt(
      [
        `设置 ${title} 期权提醒`,
        '输入格式：>1.50 表示高于等于提醒，<0.80 表示低于等于提醒',
      ].join('\n'),
      Number.isFinite(defaultTarget) && defaultTarget > 0 ? `>${defaultTarget.toFixed(2)}` : '>'
    );
    if (!input) return;

    const parsedAlert = parseOptionAlertInput(input, 'ABOVE');
    if (!parsedAlert) {
      Toast.show({ content: '请输入有效提醒，例如 >1.50 或 <0.80' });
      return;
    }

    const underlyingSymbol = String(holding.underlying_symbol || holding.symbol || '').trim().toUpperCase();
    const contractSymbol = optionDisplay?.contractSymbol || String(holding.asset_id || '').replace(/^OPTION_/i, '');
    await db.addPriceAlert({
      id: crypto.randomUUID(),
      symbol: underlyingSymbol,
      asset_id: contractSymbol || holding.asset_id,
      asset_type: 'OPTION',
      condition: parsedAlert.condition,
      target_price: parsedAlert.target,
      last_price: Number.isFinite(defaultTarget) ? defaultTarget : null,
      channels: null,
      note: [
        holding.expiry_date ? `EXP ${holding.expiry_date}` : '',
        holding.option_type || '',
        holding.strike_price ? `Strike ${holding.strike_price}` : '',
        holding.broker ? `Broker ${holding.broker}` : '',
      ].filter(Boolean).join(' · '),
    });

    await syncCloudAlerts({ notificationConfig, marketDataConfig });
    Toast.show({
      icon: 'success',
      content: `期权提醒已添加：${parsedAlert.condition === 'ABOVE' ? '高于等于' : '低于等于'} ${parsedAlert.target}`,
    });
  };

  const totalBuys = Number(summary?.total_buys) || 0;
  const totalSells = Number(summary?.total_sells) || 0;
  const realizedPnl = Number(summary?.realized_pnl) || 0;
  const pnlClass =
    realizedPnl > 0 ? 'profit' : realizedPnl < 0 ? 'loss' : 'neutral';
  const pnlPrefix = realizedPnl > 0 ? '+' : '';
  const portfolioLabel = selectedAuthor
    ? `${selectedAuthor} 的持仓`
    : isTeamWorkspace
      ? '团队投资组合'
      : '我的持仓';
  const portfolioModeLabel = selectedAuthor
    ? '筛选视图'
    : isTeamWorkspace
      ? '团队镜像'
      : '本地账本';
  const portfolioHint = selectedAuthor
    ? '仅查看该提交人的活跃仓位、成交流向与已实现结果'
    : isTeamWorkspace
      ? '聚合团队同步记录，快速识别当前组合暴露'
      : '从本地交易记录自动汇总，保持私有优先';
  const netFlow = totalBuys - totalSells;
  const netFlowLabel = netFlow >= 0 ? '净投入' : '净回收';

  return (
    <div className="holdings-page">
      {/* ── Header ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__header">
          <h1 className="holdings-page__title">持仓总览</h1>
          <p className="holdings-page__subtitle">
            {isTeamWorkspace ? '团队镜像数据聚合计算' : '基于我的交易记录自动计算'}
          </p>
        </div>
      </div>

      {/* ── Portfolio Summary ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__summary glass-card">
          <div className="holdings-page__summary-hero">
            <div className="holdings-page__summary-copy">
              <span className="holdings-page__summary-eyebrow">
                Portfolio Radar
              </span>
              <div className="holdings-page__summary-title-row">
                <h2 className="holdings-page__summary-title">
                  {portfolioLabel}
                </h2>
                <span className={`holdings-page__summary-mode holdings-page__summary-mode--${isTeamWorkspace ? 'team' : 'local'}`}>
                  {portfolioModeLabel}
                </span>
              </div>
              <p className="holdings-page__summary-hint">
                {portfolioHint}
              </p>
            </div>

            <div className={`holdings-page__summary-orb holdings-page__summary-orb--${pnlClass}`}>
              <strong className="text-mono">{holdings.length}</strong>
              <span>Active</span>
            </div>
          </div>

          <div className="holdings-page__summary-strip">
            <div className="holdings-page__summary-strip-item">
              <span>当前口径</span>
              <strong>{portfolioModeLabel}</strong>
            </div>
            <div className="holdings-page__summary-strip-item">
              <span>{netFlowLabel}</span>
              <strong className="text-mono">${formatCurrency(Math.abs(netFlow))}</strong>
            </div>
          </div>

          <div className="holdings-page__summary-grid">
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                ${formatCurrency(totalBuys)}
              </div>
              <div className="holdings-page__summary-item-label">总买入</div>
            </div>
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                ${formatCurrency(totalSells)}
              </div>
              <div className="holdings-page__summary-item-label">总卖出</div>
            </div>
            <div className="holdings-page__summary-item">
              <div
                className={`holdings-page__summary-item-value holdings-page__summary-item-value--${pnlClass} text-mono`}
              >
                {pnlPrefix}${formatCurrency(realizedPnl)}
              </div>
              <div className="holdings-page__summary-item-label">已实现盈亏</div>
            </div>
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                {holdings.length}
              </div>
              <div className="holdings-page__summary-item-label">活跃持仓</div>
            </div>
          </div>
        </div>
      </div>

      <div className="holdings-page__section">
        <div className="holdings-page__author-filter glass-card">
          <div className="holdings-page__author-filter-header">
            <span>按提交人查看</span>
            {selectedAuthor && (
              <button
                className="holdings-page__author-clear"
                onClick={() => {
                  setSelectedAuthor('');
                  setExpandedId(null);
                  setExpandedTrades([]);
                }}
              >
                查看全部
              </button>
            )}
          </div>
          <input
            className="holdings-page__author-search"
            value={authorSearch}
            onChange={(event) => setAuthorSearch(event.target.value)}
            placeholder="搜索花名"
          />
          <div className="holdings-page__author-pills">
            <button
              className={`holdings-page__author-pill ${!selectedAuthor ? 'holdings-page__author-pill--active' : ''}`}
              onClick={() => {
                setSelectedAuthor('');
                setExpandedId(null);
                setExpandedTrades([]);
              }}
            >
              全部
            </button>
            {filteredAuthors.map((author) => (
              <button
                key={author}
                className={`holdings-page__author-pill ${selectedAuthor === author ? 'holdings-page__author-pill--active' : ''}`}
                onClick={() => {
                  setSelectedAuthor(author);
                  setExpandedId(null);
                  setExpandedTrades([]);
                }}
              >
                {author}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Holdings List ── */}
      <div className="holdings-page__section">
        <div className="holdings-page__list-toolbar">
          <span className="holdings-page__list-count">
            {holdings.length} 个活跃持仓
          </span>
          <div className="holdings-page__view-toggle" aria-label="持仓视图">
            <button
              className={`holdings-page__view-toggle-btn ${
                viewMode === 'compact' ? 'holdings-page__view-toggle-btn--active' : ''
              }`}
              onClick={() => handleViewModeChange('compact')}
            >
              紧凑
            </button>
            <button
              className={`holdings-page__view-toggle-btn ${
                viewMode === 'card' ? 'holdings-page__view-toggle-btn--active' : ''
              }`}
              onClick={() => handleViewModeChange('card')}
            >
              卡片
            </button>
          </div>
        </div>

        {holdingsLoading && holdings.length === 0 ? (
          <div className="holdings-page__loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton--card" />
            ))}
          </div>
        ) : holdings.length > 0 ? (
          <div className="holdings-page__list">
            {holdings.map((holding, idx) => {
              const holdingKey = `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`;
              const isExpanded = expandedId === holdingKey;

              return (
                <HoldingCard
                  key={holdingKey}
                  holding={holding}
                  underlyingPrice={underlyingQuotes[String(holding.underlying_symbol || holding.symbol || '').trim().toUpperCase()]}
                  optionQuote={optionQuotes[holdingKey]}
                  index={idx}
                  viewMode={viewMode}
                  isExpanded={isExpanded}
                  selectedAuthor={selectedAuthor}
                  expandedTrades={isExpanded ? expandedTrades : []}
                  tradesLoading={tradesLoading}
                  onToggle={handleToggle}
                  onAddOptionAlert={!isTeamWorkspace ? handleAddOptionAlert : null}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="📊"
            title={isTeamWorkspace ? '团队空间暂无持仓' : '暂无持仓'}
            subtitle={isTeamWorkspace ? '请先在设置中拉取团队空间数据' : '开始录入交易记录后自动生成'}
          />
        )}
      </div>
    </div>
  );
}
