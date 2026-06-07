export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function shouldTriggerAlert(alert, price) {
  const currentPrice = toNumber(price);
  const targetPrice = toNumber(alert?.target_price);

  if (currentPrice === null || targetPrice === null) return false;
  if (alert.condition === 'ABOVE') return currentPrice >= targetPrice;
  if (alert.condition === 'BELOW') return currentPrice <= targetPrice;
  return false;
}

export function conditionLabel(condition) {
  return condition === 'ABOVE' ? '高于或等于' : '低于或等于';
}

export function parseAlertChannels(rawChannels, notificationConfig = {}) {
  if (Array.isArray(rawChannels)) return rawChannels;

  if (rawChannels) {
    try {
      const parsed = JSON.parse(rawChannels);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to configured channels.
    }
  }

  return [
    notificationConfig.emailEnabled ? 'email' : null,
    notificationConfig.feishuEnabled ? 'feishu' : null,
  ].filter(Boolean);
}

export function buildAlertNotification(alert, price) {
  const title = `价格提醒触发：${alert.asset_id || alert.symbol}`;
  const body = [
    `${alert.asset_id || alert.symbol} 当前价格 ${price}`,
    `条件：${conditionLabel(alert.condition)} ${Number(alert.target_price)}`,
    alert.note ? `备注：${alert.note}` : '',
  ].filter(Boolean).join('\n');

  return { title, body };
}
