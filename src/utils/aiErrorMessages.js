export function getAiErrorMessage(error, context = 'ai') {
  const rawMessage = typeof error === 'string' ? error : error?.message;
  const message = String(rawMessage || '').trim();

  if (/\b(429|too many requests|rate limit|quota)\b/i.test(message)) {
    return context === 'ocr'
      ? 'OCR 额度或并发已达上限，请稍后重试，或切换高配额模型后再试。你仍可根据参考截图手动补全交易。'
      : 'AI 分析请求过于密集，请稍后重试；数据已保留，本次不会影响复盘记录。';
  }

  if (/\b(503|502|overload|unavailable|busy)\b/i.test(message)) {
    return context === 'ocr'
      ? '识别模型暂时繁忙，请稍后重试。参考截图已保留，可先手动录入关键字段。'
      : 'AI 模型暂时繁忙，请稍后重新生成诊断。';
  }

  if (/\b(network|failed to fetch|timeout|timed out)\b/i.test(message)) {
    return context === 'ocr'
      ? '网络连接异常，暂时无法识别截图。参考截图已保留，可先手动录入。'
      : '网络连接异常，暂时无法生成 AI 诊断，请稍后重试。';
  }

  const fallback = message || '未知错误';
  return context === 'ocr'
    ? `识别失败: ${fallback}。参考截图已保留，可手动修改或补全字段。`
    : `诊断失败: ${fallback}`;
}

export function getEmptyOcrMessage() {
  return '未识别到完整交易信息。参考截图已保留，请手动补全代码、方向、数量、价格和日期。';
}
