export const OCR_PROGRESS_PHASES = [
  '正在读取参考截图...',
  '正在识别交易代码、方向和价格...',
  '正在校验日期、数量和期权字段...',
  '正在整理识别结果，请稍候...',
];

const MODEL_LABELS = {
  'gemini-3.5-flash': '3.5 Flash',
  'gemini-3.1-flash-lite': '3.1 Lite',
  'gemini-3-flash-preview': '3 Flash Preview',
  'gemini-2.0-flash': '2.0 Flash',
};

export function getOcrModelLabel(model) {
  const value = String(model || '').trim();
  return MODEL_LABELS[value] || value || '当前模型';
}

export function buildOcrSuccessMessage({ trades = [], meta = {} } = {}) {
  const tradeCount = Array.isArray(trades) ? trades.length : Number(trades || 0);
  const countText = tradeCount > 0 ? `，识别到 ${tradeCount} 笔交易` : '';
  const retryCount = Math.max(0, Number(meta.retryCount || meta.retry_count || 0));

  if (meta.fallbackUsed || meta.fallback_used) {
    return `识别完成：主模型响应异常，已使用 ${getOcrModelLabel(meta.modelUsed || meta.model_used)} 完成${countText}`;
  }

  if (retryCount > 0) {
    return `识别完成：模型短暂繁忙，重试 ${retryCount} 次后完成${countText}`;
  }

  return `识别完成${countText}`;
}
