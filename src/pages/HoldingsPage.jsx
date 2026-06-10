import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
import EmptyState from '../components/common/EmptyState';
import OptionAlertSheet from '../components/common/OptionAlertSheet';
import HoldingCard from '../components/Holdings/HoldingCard';
import { parseOptionAlertInput } from '../utils/optionMonitoring';
import { getTradeOptionDisplay } from '../utils/tradeLifecycle';
import { buildOCCContractSymbol } from '../utils/optionsMarket';
import { buildOptionHoldingMetrics, buildOptionRealtimeSummary } from '../utils/optionPortfolio';
import { syncCloudAlerts } from '../utils/cloudAlerts';
import { buildApiCacheKey, fetchJsonWithCache } from '../utils/apiCache';
import { getReadableAssetName } from '../utils/displayText';
import './HoldingsPage.css';

const formatCurrency = (num) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatSignedCurrency = (num) => {
  const value = Number(num);
  if (!Number.isFinite(value)) return '--';
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}$${formatCurrency(Math.abs(value))}`;
};

const formatOptionAlertDefault = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `>${number.toFixed(2)}` : '>';
};

const toFiniteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatPercentValue = (value, digits = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(digits)}%`;
};

const getHoldingAssetType = (holding = {}) => String(holding.type || 'STOCK').toUpperCase();

const getHoldingSymbol = (holding = {}) => String(
  getHoldingAssetType(holding) === 'OPTION'
    ? holding.underlying_symbol || holding.symbol
    : holding.symbol
).trim().toUpperCase();

const getHoldingDisplayName = (holding = {}) => getReadableAssetName({
  symbol: holding.symbol,
  name: holding.name,
  fallback: holding.symbol,
});

const getQuotePrice = (quote = {}) => toFiniteNumberOrNull(quote?.displayPrice ?? quote?.price ?? quote?.regularMarketPrice);

const getQuoteChange = (quote = {}) => toFiniteNumberOrNull(quote?.displayAbsChange ?? quote?.absChange);

const buildStockHoldingMetrics = (holding = {}, quote = null) => {
  const quantity = Number(holding.total_quantity ?? holding.quantity) || 0;
  const avgCost = Number(holding.avg_cost ?? holding.price) || 0;
  const livePrice = getQuotePrice(quote);
  const hasLivePrice = livePrice !== null && livePrice >= 0;
  const unitPrice = hasLivePrice ? livePrice : avgCost;
  const costBasis = quantity * avgCost;
  const positionValue = quantity * unitPrice;
  const unrealizedPnl = hasLivePrice ? positionValue - costBasis : null;
  const unrealizedPnlPct = hasLivePrice && costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : null;
  const dayChangeUnit = getQuoteChange(quote);
  const dayPnl = hasLivePrice && dayChangeUnit !== null ? dayChangeUnit * quantity : null;
  const dayPnlPct = toFiniteNumberOrNull(quote?.displayPctChange ?? quote?.pctChange);
  const pnlTone = unrealizedPnl > 0 ? 'profit' : unrealizedPnl < 0 ? 'loss' : 'neutral';

  return {
    assetType: getHoldingAssetType(holding),
    quantity,
    avgCost,
    multiplier: 1,
    livePrice,
    hasLivePrice,
    positionValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPct,
    dayPnl,
    dayPnlPct,
    pnlTone,
    quoteProvider: quote?.provider || quote?.exchangeName || '',
    quoteUnavailable: Boolean(quote?.error),
  };
};

const buildLiveHoldingMetrics = (holding = {}, quote = null, optionQuote = null) => {
  const assetType = getHoldingAssetType(holding);
  if (assetType === 'OPTION') {
    const optionMetrics = buildOptionHoldingMetrics(holding, optionQuote);
    return {
      ...optionMetrics,
      assetType,
      livePrice: optionMetrics.liveOptionPrice,
      hasLivePrice: optionMetrics.hasLiveOptionPrice,
      dayPnl: optionMetrics.optionDayChange,
      dayPnlPct: optionMetrics.optionDayChangePct,
      quoteProvider: optionQuote?.provider || '',
    };
  }
  return buildStockHoldingMetrics(holding, quote);
};

const getPortfolioTone = (value) => (value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral');

const getAllocationColor = (index) => [
  '#38bdf8',
  '#2dd4bf',
  '#a78bfa',
  '#f59e0b',
  '#fb7185',
  '#22c55e',
  '#f472b6',
  '#94a3b8',
][index % 8];

function buildPortfolioRealtimeSummary(liveHoldings = []) {
  return liveHoldings.reduce((summary, holding) => {
    const metrics = holding.liveMetrics || {};
    const value = Number(metrics.positionValue) || 0;
    const cost = Number(metrics.costBasis) || 0;
    const unrealized = Number(metrics.unrealizedPnl);
    const dayPnl = Number(metrics.dayPnl);
    const hasLivePrice = Boolean(metrics.hasLivePrice);

    summary.count += 1;
    summary.marketValue += value;
    summary.costBasis += cost;
    if (Number.isFinite(unrealized)) summary.unrealizedPnl += unrealized;
    else summary.unrealizedMissing += 1;
    if (Number.isFinite(dayPnl)) summary.dayPnl += dayPnl;
    else summary.dayPnlMissing += 1;
    if (hasLivePrice) summary.quoted += 1;
    return summary;
  }, {
    count: 0,
    quoted: 0,
    marketValue: 0,
    costBasis: 0,
    unrealizedPnl: 0,
    unrealizedMissing: 0,
    dayPnl: 0,
    dayPnlMissing: 0,
  });
}

function buildAllocationModel(liveHoldings = []) {
  const positiveHoldings = liveHoldings
    .map((holding, index) => ({
      holding,
      value: Math.max(Number(holding.liveMetrics?.positionValue) || 0, 0),
      index,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = positiveHoldings.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return {
      total,
      rows: [],
      conic: 'rgba(148, 163, 184, 0.18) 0deg 360deg',
    };
  }

  let cursor = 0;
  const rows = positiveHoldings.map((item, index) => {
    const percent = item.value / total;
    const start = cursor;
    const end = cursor + percent * 360;
    cursor = end;
    const assetType = getHoldingAssetType(item.holding);
    return {
      id: `${item.holding.asset_id}-${item.holding.broker || ''}-${item.holding.author || '未标记'}`,
      symbol: item.holding.symbol,
      name: getHoldingDisplayName(item.holding),
      type: assetType,
      typeLabel: assetType === 'OPTION' ? '期权' : assetType === 'ETF' ? 'ETF' : assetType === 'STOCK' ? '股票' : assetType,
      value: item.value,
      percent,
      color: getAllocationColor(index),
      start,
      end,
      holding: item.holding,
    };
  });
  const conic = rows
    .map((row) => `${row.color} ${row.start.toFixed(1)}deg ${row.end.toFixed(1)}deg`)
    .join(', ');

  return { total, rows, conic };
}

function buildPortfolioInsights(liveHoldings = [], realtimeSummary = {}, allocation = {}) {
  const typeTotals = liveHoldings.reduce((map, holding) => {
    const type = getHoldingAssetType(holding);
    const value = Math.max(Number(holding.liveMetrics?.positionValue) || 0, 0);
    map[type] = (map[type] || 0) + value;
    return map;
  }, {});
  const total = Math.max(Number(realtimeSummary.marketValue) || 0, 0);
  const optionWeight = total > 0 ? (typeTotals.OPTION || 0) / total : 0;
  const topWeight = allocation.rows?.[0]?.percent || 0;
  const quotedRatio = realtimeSummary.count > 0 ? realtimeSummary.quoted / realtimeSummary.count : 0;
  const nearExpiryCount = liveHoldings.filter((holding) => {
    if (getHoldingAssetType(holding) !== 'OPTION') return false;
    const expiry = holding.expiry_date;
    if (!expiry) return false;
    const date = new Date(`${expiry}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    const days = Math.ceil((date - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    return days >= 0 && days <= 7;
  }).length;

  const typeLabel = optionWeight >= 0.45
    ? '期权进攻型'
    : (typeTotals.ETF || 0) / Math.max(total, 1) >= 0.35
      ? 'ETF 均衡型'
      : topWeight >= 0.45
        ? '集中持仓型'
        : '股票均衡型';

  const insights = [
    {
      label: '组合类型',
      value: typeLabel,
      tone: optionWeight >= 0.45 || topWeight >= 0.45 ? 'warning' : 'info',
      detail: optionWeight >= 0.45
        ? `期权市值占比 ${(optionWeight * 100).toFixed(1)}%，组合弹性高，建议每天确认到期日、IV 和最大亏损。`
        : topWeight >= 0.45
          ? `第一大持仓占比 ${(topWeight * 100).toFixed(1)}%，单一标的会主导净值波动，可考虑分批降集中度。`
          : '持仓类型相对分散，适合继续用仓位上限和止损价维护纪律。',
    },
    {
      label: '实时覆盖',
      value: `${realtimeSummary.quoted}/${realtimeSummary.count}`,
      tone: quotedRatio >= 0.8 ? 'good' : 'warning',
      detail: quotedRatio >= 0.8
        ? '大多数仓位已有实时/准实时价格，顶部估值可以作为当前组合参考。'
        : '仍有仓位缺少实时价，估值已用成本价兜底；建议先补齐行情源 Token 或检查标的代码。',
    },
    {
      label: '风险提醒',
      value: nearExpiryCount > 0 ? `${nearExpiryCount} 个短期期权` : '暂无末日期权',
      tone: nearExpiryCount > 0 ? 'danger' : 'good',
      detail: nearExpiryCount > 0
        ? '7 天内到期的期权需要优先处理，尤其是深度 OTM 或低流动性合约，避免时间价值快速归零。'
        : '近期到期压力较低，可以把复盘重点放在持仓逻辑和仓位再平衡上。',
    },
  ];

  return { typeTotals, typeLabel, insights };
}

const buildMarketDataHeaders = (marketDataConfig = {}) => ({
  ...(marketDataConfig.tradierToken ? { 'X-Tradier-Token': marketDataConfig.tradierToken } : {}),
  ...(marketDataConfig.polygonToken ? { 'X-Polygon-Token': marketDataConfig.polygonToken } : {}),
  ...(marketDataConfig.marketDataToken ? { 'X-MarketData-Token': marketDataConfig.marketDataToken } : {}),
  ...(marketDataConfig.longbridgeAppKey ? { 'X-Longbridge-App-Key': marketDataConfig.longbridgeAppKey } : {}),
  ...(marketDataConfig.longbridgeAppSecret ? { 'X-Longbridge-App-Secret': marketDataConfig.longbridgeAppSecret } : {}),
  ...(marketDataConfig.longbridgeAccessToken ? { 'X-Longbridge-Access-Token': marketDataConfig.longbridgeAccessToken } : {}),
});

const hashCredential = (value) => {
  const text = String(value || '');
  if (!text) return '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
};

const getMarketDataConfigFingerprint = (marketDataConfig = {}) => [
  marketDataConfig.optionProvider || 'auto',
  marketDataConfig.tradierToken ? `tradier:${hashCredential(marketDataConfig.tradierToken)}` : '',
  marketDataConfig.polygonToken ? `polygon:${hashCredential(marketDataConfig.polygonToken)}` : '',
  marketDataConfig.marketDataToken ? `marketdata:${hashCredential(marketDataConfig.marketDataToken)}` : '',
  marketDataConfig.longbridgeAppKey && marketDataConfig.longbridgeAccessToken
    ? `longbridge:${hashCredential(`${marketDataConfig.longbridgeAppKey}:${marketDataConfig.longbridgeAccessToken}`)}`
    : '',
].filter(Boolean).join(':') || 'public';

const normalizeOptionQuoteError = (message) => {
  const text = String(message || '').trim();
  if (!text) return '期权报价加载失败，请稍后重试。';
  if (/MarketData\.app quotes responded with 429/i.test(text)) {
    return 'MarketData.app 期权报价请求过于频繁或额度已用尽，请稍后重试或降低刷新频率。';
  }
  if (/MarketData\.app quotes responded with (401|403)/i.test(text)) {
    return 'MarketData.app 期权报价权限不足或 Token 不可用，请检查 Token、试用额度、套餐和 OPRA 授权。';
  }
  if (/responded with 429/i.test(text)) {
    return '行情数据源请求过于频繁或额度已用尽，请稍后重试。';
  }
  if (/responded with (401|403)/i.test(text)) {
    return '行情数据源权限不足或 Token 不可用，请检查设置中的数据源配置。';
  }
  return text;
};

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

const getOptionHoldingSignature = (holdings = []) => holdings
  .filter((holding) => String(holding.type || '').toUpperCase() === 'OPTION')
  .map((holding) => [
    holding.asset_id,
    holding.symbol,
    holding.underlying_symbol,
    holding.expiry_date,
    holding.option_type,
    holding.strike_price,
    holding.contract_symbol,
    holding.broker,
    holding.author,
  ].map((item) => String(item || '').trim()).join(':'))
  .sort()
  .join('|');

const getHoldingMarketSignature = (holdings = []) => holdings
  .map((holding) => [
    getHoldingAssetType(holding),
    getHoldingSymbol(holding),
    holding.asset_id,
    holding.broker,
    holding.author,
  ].map((item) => String(item || '').trim()).join(':'))
  .sort()
  .join('|');

export default function HoldingsPage() {
  const { holdings, summary, holdingsLoading, refreshHoldings } =
    useTradeStore();
  const workspaceScope = useAppStore((s) => s.workspaceScope);
  const notificationConfig = useAppStore((s) => s.notificationConfig);
  const marketDataConfig = useAppStore((s) => s.marketDataConfig);
  const marketWatchlist = useAppStore((s) => s.marketWatchlist);
  const addMarketWatchItem = useAppStore((s) => s.addMarketWatchItem);
  const marketDataFingerprint = getMarketDataConfigFingerprint(marketDataConfig);
  const isTeamWorkspace = workspaceScope === 'team';
  const autoWatchSignatureRef = useRef('');

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
  const [marketQuotes, setMarketQuotes] = useState({});
  const [optionQuotes, setOptionQuotes] = useState({});
  const [optionAlertSheet, setOptionAlertSheet] = useState(null);
  const [selectedAllocationId, setSelectedAllocationId] = useState('');
  const optionHoldingSignature = useMemo(() => getOptionHoldingSignature(holdings), [holdings]);
  const holdingMarketSignature = useMemo(() => getHoldingMarketSignature(holdings), [holdings]);

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
    async function loadMarketQuotes() {
      const symbols = Array.from(new Set(
        holdings
          .map(getHoldingSymbol)
          .filter(Boolean)
      ));

      if (symbols.length === 0) {
        setMarketQuotes({});
        return;
      }

      try {
        const url = `/api/market?symbols=${encodeURIComponent(symbols.join(','))}&extended=1`;
        const { data: json } = await fetchJsonWithCache(url, {
          headers: buildMarketDataHeaders(marketDataConfig),
        }, {
          cacheKey: buildApiCacheKey(['holdings-market-quotes', symbols.sort().join(','), marketDataFingerprint]),
          ttlMs: 5_000,
          staleTtlMs: 60_000,
          timeoutMs: 6_000,
        });
        if (cancelled) return;
        const nextQuotes = {};
        symbols.forEach((symbol) => {
          const item = json?.data?.[symbol];
          const price = getQuotePrice(item);
          if (price !== null) {
            nextQuotes[symbol] = item;
          }
        });
        setMarketQuotes(nextQuotes);
      } catch (err) {
        console.warn('Failed to load holdings market quotes:', err);
      }
    }

    loadMarketQuotes();
    const timer = window.setInterval(loadMarketQuotes, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [holdingMarketSignature, marketDataConfig, marketDataFingerprint]);

  useEffect(() => {
    const symbols = Array.from(new Set(holdings.map(getHoldingSymbol).filter(Boolean)));
    const signature = symbols.sort().join('|');
    if (!signature || autoWatchSignatureRef.current === signature) return;

    const existing = new Set((marketWatchlist || []).map((item) => String(item.symbol || '').toUpperCase()));
    let added = 0;
    holdings.forEach((holding) => {
      const symbol = getHoldingSymbol(holding);
      if (!symbol || existing.has(symbol)) return;
      const assetType = getHoldingAssetType(holding);
      const isOption = assetType === 'OPTION';
      const normalizedType = assetType === 'ETF' ? 'ETF' : 'EQUITY';
      const didAdd = addMarketWatchItem({
        symbol,
        name: isOption
          ? `${symbol} 标的`
          : getHoldingDisplayName(holding),
        quoteType: normalizedType,
        typeDisp: assetType === 'ETF' ? 'ETF' : '股票',
        region: 'US',
      });
      if (didAdd) {
        existing.add(symbol);
        added += 1;
      }
    });

    if (added > 0) {
      console.info(`已自动把 ${added} 个持仓标的加入关注列表`);
    }
    autoWatchSignatureRef.current = signature;
  }, [addMarketWatchItem, holdings, marketWatchlist]);

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
        const uniqueCandidates = Array.from(
          candidates
            .reduce((map, candidate) => {
              const quoteKey = `${candidate.underlying}:${candidate.contract}`;
              const entry = map.get(quoteKey) || {
                quoteKey,
                underlying: candidate.underlying,
                contract: candidate.contract,
                keys: [],
              };
              entry.keys.push(candidate.key);
              map.set(quoteKey, entry);
              return map;
            }, new Map())
            .values()
        );
        const quoteEntries = await Promise.all(uniqueCandidates.map(async (candidate) => {
          const params = new URLSearchParams({
            symbol: candidate.underlying,
            provider: marketDataConfig.optionProvider || 'auto',
            contract: candidate.contract,
            includePrevious: '1',
          });
          try {
            const url = `/api/options-chain?${params.toString()}`;
            const { data: json } = await fetchJsonWithCache(url, { headers }, {
              cacheKey: buildApiCacheKey([
                'holdings-option-quote',
                candidate.underlying,
                candidate.contract,
                marketDataFingerprint,
              ]),
              ttlMs: 30_000,
              staleTtlMs: 5 * 60_000,
              timeoutMs: 10_000,
            });
            const quote = json?.options?.[0] || null;
            return [candidate.quoteKey, quote ? { ...quote, provider: json.provider || quote.provider, generatedAt: json.generatedAt } : {
              provider: json.provider || marketDataConfig.optionProvider || '期权报价',
              quoteUnavailable: true,
              error: normalizeOptionQuoteError(json.message || '期权报价未返回，请检查合约、数据源权限或 OPRA 授权。'),
              contractSymbol: candidate.contract,
              generatedAt: json.generatedAt || new Date().toISOString(),
            }];
          } catch (error) {
            return [candidate.quoteKey, {
              provider: marketDataConfig.optionProvider || '期权报价',
              quoteUnavailable: true,
              error: normalizeOptionQuoteError(error.message || '期权报价加载失败'),
              contractSymbol: candidate.contract,
              generatedAt: new Date().toISOString(),
            }];
          }
        }));
        if (cancelled) return;
        const quotesByContract = Object.fromEntries(quoteEntries.filter(([, quote]) => quote));
        const entries = candidates.map((candidate) => {
          const quoteKey = `${candidate.underlying}:${candidate.contract}`;
          return [candidate.key, quotesByContract[quoteKey] || {
            provider: marketDataConfig.optionProvider || '期权报价',
            quoteUnavailable: true,
            error: normalizeOptionQuoteError('期权报价加载失败'),
            contractSymbol: candidate.contract,
            generatedAt: new Date().toISOString(),
          }];
        });
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
  }, [optionHoldingSignature, marketDataFingerprint]);

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

  const handleAddOptionAlert = (holding) => {
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
    setOptionAlertSheet({
      holding,
      optionDisplay,
      title: `设置 ${title} 期权提醒`,
      subtitle: [
        holding.underlying_symbol || holding.symbol,
        holding.expiry_date ? `EXP ${holding.expiry_date}` : '',
        holding.option_type,
        holding.strike_price ? `Strike ${holding.strike_price}` : '',
        holding.broker,
      ].filter(Boolean).join(' · '),
      defaultValue: formatOptionAlertDefault(defaultTarget),
      metaItems: [
        { label: '均价', value: Number.isFinite(defaultTarget) ? `$${formatCurrency(defaultTarget)}` : '--' },
        { label: '数量', value: holding.quantity ? `${holding.quantity} 张` : '--' },
        { label: '市值', value: holding.market_value ? `$${formatCurrency(holding.market_value)}` : '--' },
        { label: 'Broker', value: holding.broker || '--' },
      ],
    });
  };

  const handleSaveOptionAlert = async (input) => {
    const holding = optionAlertSheet?.holding;
    const optionDisplay = optionAlertSheet?.optionDisplay;
    if (!holding) return false;

    const parsedAlert = parseOptionAlertInput(input, 'ABOVE');
    if (!parsedAlert) {
      Toast.show({ content: '请输入有效提醒，例如 >1.50 或 <0.80' });
      return false;
    }

    const underlyingSymbol = String(holding.underlying_symbol || holding.symbol || '').trim().toUpperCase();
    const contractSymbol = optionDisplay?.contractSymbol || String(holding.asset_id || '').replace(/^OPTION_/i, '');
    const holdingKey = `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`;
    const quote = optionQuotes[holdingKey];
    const defaultTarget = toFiniteNumberOrNull(quote?.mark ?? quote?.last ?? holding.avg_cost);
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

    setOptionAlertSheet(null);
    await syncCloudAlerts({ notificationConfig, marketDataConfig });
    Toast.show({
      icon: 'success',
      content: `期权提醒已添加：${parsedAlert.condition === 'ABOVE' ? '高于等于' : '低于等于'} ${parsedAlert.target}`,
    });
    return true;
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
      : '从本地交易记录自动汇总，叠加行情实时估值';
  const netFlow = totalBuys - totalSells;
  const netFlowLabel = netFlow >= 0 ? '净投入' : '净回收';

  const liveHoldings = useMemo(() => holdings.map((holding) => {
    const holdingKey = `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`;
    const symbol = getHoldingSymbol(holding);
    return {
      ...holding,
      liveMetrics: buildLiveHoldingMetrics(holding, marketQuotes[symbol], optionQuotes[holdingKey]),
      marketQuote: marketQuotes[symbol] || null,
      optionQuote: optionQuotes[holdingKey] || null,
    };
  }), [holdings, marketQuotes, optionQuotes]);

  const realtimeSummary = useMemo(() => buildPortfolioRealtimeSummary(liveHoldings), [liveHoldings]);
  const allocation = useMemo(() => buildAllocationModel(liveHoldings), [liveHoldings]);
  const selectedAllocation = useMemo(() => {
    if (!allocation.rows.length) return null;
    return allocation.rows.find((row) => row.id === selectedAllocationId) || allocation.rows[0];
  }, [allocation.rows, selectedAllocationId]);
  const handleAllocationChartClick = useCallback((event) => {
    const rows = allocation.rows || [];
    if (!rows.length) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const radius = Math.sqrt((x * x) + (y * y));
    const activeId = selectedAllocationId || rows[0]?.id;

    let nextRow = null;
    if (radius < rect.width * 0.31) {
      const currentIndex = Math.max(rows.findIndex((row) => row.id === activeId), 0);
      nextRow = rows[(currentIndex + 1) % rows.length];
    } else {
      const angle = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
      nextRow = rows.find((row) => angle >= row.start && angle <= row.end) || rows[0];
    }

    if (nextRow) setSelectedAllocationId(nextRow.id);
  }, [allocation.rows, selectedAllocationId]);
  const portfolioInsights = useMemo(
    () => buildPortfolioInsights(liveHoldings, realtimeSummary, allocation),
    [liveHoldings, realtimeSummary, allocation]
  );
  const realtimePnlClass = getPortfolioTone(realtimeSummary.unrealizedPnl);
  const realtimeDayClass = getPortfolioTone(realtimeSummary.dayPnl);
  const realtimeCoverage = realtimeSummary.count
    ? `${realtimeSummary.quoted}/${realtimeSummary.count}`
    : '0/0';
  const realtimePnlPct = realtimeSummary.costBasis > 0
    ? (realtimeSummary.unrealizedPnl / realtimeSummary.costBasis) * 100
    : null;
  const optionRealtimeSummary = buildOptionRealtimeSummary(holdings, optionQuotes);
  const hasOptionRealtimeSummary = optionRealtimeSummary.count > 0;
  const optionRealtimePnlClass = optionRealtimeSummary.unrealizedPnl > 0
    ? 'profit'
    : optionRealtimeSummary.unrealizedPnl < 0
      ? 'loss'
      : 'neutral';
  const optionRealtimeDayClass = optionRealtimeSummary.dayPnl > 0
    ? 'profit'
    : optionRealtimeSummary.dayPnl < 0
      ? 'loss'
      : 'neutral';
  const optionRealtimeCoverage = optionRealtimeSummary.count
    ? `${optionRealtimeSummary.quoted}/${optionRealtimeSummary.count}`
    : '0/0';

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
              <span>行情覆盖</span>
              <strong>{realtimeCoverage}</strong>
            </div>
            <div className="holdings-page__summary-strip-item">
              <span>{netFlowLabel}</span>
              <strong className="text-mono">${formatCurrency(Math.abs(netFlow))}</strong>
            </div>
          </div>

          <div className="holdings-page__summary-grid">
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                ${formatCurrency(realtimeSummary.marketValue)}
              </div>
              <div className="holdings-page__summary-item-label">实时估值</div>
            </div>
            <div className="holdings-page__summary-item">
              <div
                className={`holdings-page__summary-item-value holdings-page__summary-item-value--${realtimePnlClass} text-mono`}
              >
                {formatSignedCurrency(realtimeSummary.unrealizedPnl)}
              </div>
              <div className="holdings-page__summary-item-label">
                未实现盈亏 {realtimePnlPct !== null ? formatPercentValue(realtimePnlPct) : ''}
              </div>
            </div>
            <div className="holdings-page__summary-item">
              <div
                className={`holdings-page__summary-item-value holdings-page__summary-item-value--${realtimeDayClass} text-mono`}
              >
                {formatSignedCurrency(realtimeSummary.dayPnl)}
              </div>
              <div className="holdings-page__summary-item-label">今日变动</div>
            </div>
            <div className="holdings-page__summary-item">
              <div className="holdings-page__summary-item-value text-mono">
                {pnlPrefix}${formatCurrency(realizedPnl)}
              </div>
              <div className="holdings-page__summary-item-label">已实现盈亏</div>
            </div>
          </div>
        </div>
      </div>

      {allocation.rows.length > 0 && (
        <div className="holdings-page__section">
          <div className="holdings-page__allocation glass-card">
            <div className="holdings-page__allocation-head">
              <div>
                <span className="holdings-page__allocation-eyebrow">Allocation AI</span>
                <h3>持仓占比</h3>
              </div>
              <span className="holdings-page__allocation-type">
                {portfolioInsights.typeLabel}
              </span>
            </div>

            <div className="holdings-page__allocation-body">
              <button
                type="button"
                className="holdings-page__allocation-chart"
                style={{ '--allocation-chart': allocation.conic }}
                aria-label={`持仓占比饼图，当前选中 ${selectedAllocation?.symbol || '全部持仓'}`}
                onClick={handleAllocationChartClick}
              >
                <div>
                  <strong>{selectedAllocation?.symbol || '全部持仓'}</strong>
                  <span className="text-mono">
                    {selectedAllocation
                      ? `${(selectedAllocation.percent * 100).toFixed(1)}%`
                      : `$${formatCurrency(allocation.total)}`}
                  </span>
                </div>
              </button>
              <div className="holdings-page__allocation-list">
                {allocation.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`holdings-page__allocation-row ${selectedAllocation?.id === row.id ? 'holdings-page__allocation-row--active' : ''}`}
                    style={{ '--row-color': row.color }}
                    onClick={() => setSelectedAllocationId(row.id)}
                    aria-pressed={selectedAllocation?.id === row.id}
                  >
                    <span />
                    <div>
                      <strong>{row.symbol}</strong>
                      <em>{row.typeLabel} · {row.name}</em>
                    </div>
                    <b className="text-mono">{(row.percent * 100).toFixed(1)}%</b>
                  </button>
                ))}
              </div>
            </div>

            {selectedAllocation && (
              <div className="holdings-page__allocation-detail">
                <span style={{ '--row-color': selectedAllocation.color }} />
                <div>
                  <strong>{selectedAllocation.symbol} · {selectedAllocation.name}</strong>
                  <em>
                    市值 ${formatCurrency(selectedAllocation.value)} · 占组合 {(selectedAllocation.percent * 100).toFixed(1)}% · {selectedAllocation.typeLabel}
                  </em>
                </div>
              </div>
            )}

            <div className="holdings-page__insight-grid">
              {portfolioInsights.insights.map((item) => (
                <div key={item.label} className={`holdings-page__insight holdings-page__insight--${item.tone}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasOptionRealtimeSummary && (
        <div className="holdings-page__section">
          <div className="holdings-page__option-radar glass-card">
            <div className="holdings-page__option-radar-head">
              <div>
                <span className="holdings-page__option-radar-eyebrow">Options Live Radar</span>
                <h3>期权实时收益</h3>
              </div>
              <span className="holdings-page__option-radar-status">
                报价覆盖 {optionRealtimeCoverage}
              </span>
            </div>

            <div className="holdings-page__option-radar-grid">
              <div className="holdings-page__option-radar-item">
                <span>Mark 估值</span>
                <strong className="text-mono">${formatCurrency(optionRealtimeSummary.marketValue)}</strong>
                <em>{optionRealtimeSummary.contracts.toLocaleString()} 张合约</em>
              </div>
              <div className="holdings-page__option-radar-item">
                <span>未实现盈亏</span>
                <strong className={`text-mono holdings-page__option-radar-value--${optionRealtimePnlClass}`}>
                  {formatSignedCurrency(optionRealtimeSummary.unrealizedPnl)}
                </strong>
                <em>成本 ${formatCurrency(optionRealtimeSummary.costBasis)}</em>
              </div>
              <div className="holdings-page__option-radar-item">
                <span>今日收益</span>
                <strong className={`text-mono holdings-page__option-radar-value--${optionRealtimeDayClass}`}>
                  {formatSignedCurrency(optionRealtimeSummary.dayPnl)}
                </strong>
                <em>{optionRealtimeSummary.dayPnlQuoted} 张有前收基准</em>
              </div>
              <div className="holdings-page__option-radar-item">
                <span>数据缺口</span>
                <strong className="text-mono">
                  {optionRealtimeSummary.pending + optionRealtimeSummary.unavailable + optionRealtimeSummary.dayPnlMissing}
                </strong>
                <em>
                  {optionRealtimeSummary.pending} 刷新中 · {optionRealtimeSummary.unavailable} 报价不可用 · {optionRealtimeSummary.dayPnlMissing} 缺前收
                </em>
              </div>
            </div>
          </div>
        </div>
      )}

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
            {liveHoldings.map((holding, idx) => {
              const holdingKey = `${holding.asset_id}-${holding.broker || ''}-${holding.author || '未标记'}`;
              const isExpanded = expandedId === holdingKey;
              const symbol = getHoldingSymbol(holding);
              const underlyingPrice = getQuotePrice(marketQuotes[symbol]);

              return (
                <HoldingCard
                  key={holdingKey}
                  holding={holding}
                  underlyingPrice={underlyingPrice}
                  marketQuote={marketQuotes[symbol]}
                  optionQuote={optionQuotes[holdingKey]}
                  liveMetrics={holding.liveMetrics}
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

      <OptionAlertSheet
        open={Boolean(optionAlertSheet)}
        title={optionAlertSheet?.title}
        subtitle={optionAlertSheet?.subtitle}
        defaultValue={optionAlertSheet?.defaultValue}
        metaItems={optionAlertSheet?.metaItems}
        onClose={() => setOptionAlertSheet(null)}
        onSubmit={handleSaveOptionAlert}
      />
    </div>
  );
}
