export const OPTION_REVIEW_ATTRIBUTIONS = [
  {
    label: '方向与时机双杀',
    value: 'PERFECT_TRADE',
    shortLabel: 'Perfect Trade',
    description: '方向判断和入场窗口都踩准了。',
  },
  {
    label: '方向错误',
    value: 'DELTA_LOSS',
    shortLabel: 'Delta Loss',
    description: '主要亏在底层标的方向看反。',
  },
  {
    label: '时间耗尽',
    value: 'THETA_DECAY',
    shortLabel: 'Theta Decay',
    description: '方向可能没错，但 DTE 被耗尽。',
  },
  {
    label: '波动率双杀',
    value: 'IV_CRUSH',
    shortLabel: 'IV Crush',
    description: '买入时 IV 过高，事件后波动率回落。',
  },
  {
    label: '提前下车',
    value: 'PAPER_HANDS',
    shortLabel: 'Paper Hands',
    description: '计划未完成前过早离场。',
  },
];

export function getOptionReviewAttribution(value) {
  return OPTION_REVIEW_ATTRIBUTIONS.find((item) => item.value === value) || null;
}

export function normalizeOptionDisciplineScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(1, Math.min(100, Math.round(score)));
}

export function normalizeOptionLesson(value, maxLength = 50) {
  return String(value || '').trim().slice(0, maxLength);
}

export function hasOptionReviewData(review = {}) {
  return Boolean(
    review.optionAttribution
    || normalizeOptionDisciplineScore(review.optionDisciplineScore) !== null
    || normalizeOptionLesson(review.optionLesson)
  );
}
