export function calculateInsightStats(data = []) {
  if (!data || data.length === 0) return null;

  const reviews = data.filter((item) => item.review_id);
  if (reviews.length === 0) return null;

  const wins = reviews.filter((item) => item.is_successful === 1).length;
  let totalProfit = 0;
  let totalLoss = 0;

  reviews.forEach((item) => {
    const pnl = Number(item.result_pnl) || 0;
    if (pnl > 0) totalProfit += pnl;
    if (pnl < 0) totalLoss += Math.abs(pnl);
  });

  const winRate = ((wins / reviews.length) * 100).toFixed(1);
  const pnlRatio = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : (totalProfit > 0 ? '∞' : '0');

  return {
    total: reviews.length,
    winRate,
    pnlRatio,
    totalProfit,
    totalLoss,
    rawData: data,
  };
}
