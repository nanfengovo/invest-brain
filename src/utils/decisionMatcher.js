const ACTIVE_STATUS_SCORE = {
  ACTIVE: 14,
  WATCH: 12,
  DRAFT: 7,
  CLOSED: -8,
  ENDED: -8,
  ABANDONED: -18,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RECOMMENDATION_SCORE = 42;

function parseTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeUnderlyingSymbol(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const clean = raw
    .replace(/^(STOCK|OPTION|ETF)_/i, '')
    .replace(/^(US|GB_|HK|SH|SZ)/i, '');
  return clean.split('_')[0].replace(/[^A-Z0-9.-]/g, '');
}

function normalizeSector(value) {
  return String(value || '').trim().toLowerCase();
}

function getDecisionSymbol(decision) {
  return normalizeUnderlyingSymbol(
    decision.asset_symbol || decision.symbol || decision.asset_id || ''
  );
}

function getTradeSymbol(trade) {
  return normalizeUnderlyingSymbol(
    trade.symbol || trade.underlying_symbol || trade.asset_symbol || trade.asset_id || ''
  );
}

function getDirectionSentiment(direction) {
  const normalized = String(direction || '').toUpperCase();
  if (['BUY', 'OPEN'].includes(normalized)) return 'BULLISH';
  if (['SELL', 'CLOSE'].includes(normalized)) return 'BEARISH';
  return '';
}

function getTimeScore(decisionTime, tradeTime) {
  if (!decisionTime || !tradeTime) return 0;
  const diffDays = (tradeTime - decisionTime) / DAY_MS;
  if (diffDays >= 0 && diffDays <= 7) return 16;
  if (diffDays > 7 && diffDays <= 30) return 12;
  if (diffDays > 30 && diffDays <= 90) return 7;
  if (diffDays > 90 && diffDays <= 180) return 3;
  if (diffDays < 0 && diffDays >= -3) return 5;
  if (diffDays < -3) return -10;
  return 0;
}

export function scoreDecisionForTrade(trade, decision) {
  const tradeSymbol = getTradeSymbol(trade);
  const decisionSymbol = getDecisionSymbol(decision);
  const tradeSector = normalizeSector(trade.sector || trade.asset_sector);
  const decisionSector = normalizeSector(decision.sector || decision.asset_sector);
  const tradeTime = parseTime(trade.trade_time);
  const decisionTime = parseTime(decision.created_at);
  const directionSentiment = getDirectionSentiment(trade.direction);
  const reasons = [];
  let score = 0;

  if (tradeSymbol && decisionSymbol && tradeSymbol === decisionSymbol) {
    score += 50;
    reasons.push(`标的 ${tradeSymbol} 完全匹配`);
  } else if (tradeSymbol && decisionSymbol && (tradeSymbol.includes(decisionSymbol) || decisionSymbol.includes(tradeSymbol))) {
    score += 26;
    reasons.push(`标的 ${tradeSymbol}/${decisionSymbol} 接近`);
  }

  if (tradeSector && decisionSector && tradeSector === decisionSector) {
    score += 18;
    reasons.push(`板块 ${decision.sector || decision.asset_sector} 匹配`);
  }

  const statusScore = ACTIVE_STATUS_SCORE[decision.status] ?? 0;
  score += statusScore;
  if (statusScore > 0) {
    reasons.push(`状态 ${decision.status || 'ACTIVE'} 仍在生命周期内`);
  }

  const timeScore = getTimeScore(decisionTime, tradeTime);
  score += timeScore;
  if (timeScore > 0) {
    reasons.push('交易时间贴近决策生成时间');
  }

  if (directionSentiment && decision.sentiment === directionSentiment) {
    score += 8;
    reasons.push('买卖方向与多空判断一致');
  }

  score += Math.min(Number(decision.priority || 3), 5);

  return {
    decision,
    score,
    reasons,
  };
}

export function recommendDecisionForTrade(trade, decisions = [], threshold = MIN_RECOMMENDATION_SCORE) {
  const ranked = decisions
    .map((decision) => scoreDecisionForTrade(trade, decision))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  if (!best || best.score < threshold) return null;

  return best;
}

export function attachDecisionRecommendations(trades = [], decisions = []) {
  return trades.map((trade) => {
    const recommendation = recommendDecisionForTrade(trade, decisions);
    if (!recommendation) return { trade, recommendation: null };
    return {
      trade: {
        ...trade,
        decision_id: trade.decision_id || recommendation.decision.id,
      },
      recommendation,
    };
  });
}
