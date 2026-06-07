import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlertNotification,
  getAlertChannels,
  normalizeCloudAlertPayload,
  shouldNotifyByInterval,
  shouldRunByInterval,
  shouldTrigger,
} from '../api/_lib/alertRules.js';

test('matches price alert thresholds without disabling active alerts', () => {
  assert.equal(shouldTrigger({ condition: 'ABOVE', target_price: 10 }, 10), true);
  assert.equal(shouldTrigger({ condition: 'ABOVE', target_price: 10 }, 9.99), false);
  assert.equal(shouldTrigger({ condition: 'BELOW', target_price: 10 }, 10), true);
  assert.equal(shouldTrigger({ condition: 'BELOW', target_price: 10 }, 10.01), false);
});

test('normalizes only active cloud alert payload rows', () => {
  const payload = normalizeCloudAlertPayload({
    userId: ' feng ',
    notificationConfig: { emailEnabled: true, alertCheckIntervalMinutes: 0 },
    alerts: [
      { id: 'a1', symbol: 'nok', condition: 'BELOW', target_price: '14.4', status: 'ACTIVE' },
      { id: 'a2', symbol: 'NOK', condition: 'ABOVE', target_price: 'bad', status: 'ACTIVE' },
      { id: 'a3', symbol: 'NOK', condition: 'ABOVE', target_price: '20', status: 'DELETED' },
    ],
  });

  assert.equal(payload.userId, 'feng');
  assert.equal(payload.notificationConfig.alertCheckIntervalMinutes, 1);
  assert.equal(payload.alerts.length, 1);
  assert.deepEqual(payload.alerts[0], {
    id: 'a1',
    symbol: 'NOK',
    asset_id: 'NOK',
    asset_type: 'STOCK',
    condition: 'BELOW',
    target_price: 14.4,
    last_price: null,
    status: 'ACTIVE',
    channels: null,
    note: null,
    updated_at: null,
  });
});

test('uses configured interval for cloud checks and repeated notifications', () => {
  const now = Date.parse('2026-06-07T10:00:00Z');

  assert.equal(shouldRunByInterval(now - 59_000, 1, now), false);
  assert.equal(shouldRunByInterval(now - 60_000, 1, now), true);
  assert.equal(shouldNotifyByInterval(now - 4 * 60_000, 5, now), false);
  assert.equal(shouldNotifyByInterval(now - 5 * 60_000, 5, now), true);
});

test('cloud channels exclude browser-only notifications', () => {
  assert.deepEqual(getAlertChannels(
    { channels: JSON.stringify(['browser', 'feishu']) },
    { emailEnabled: true, feishuEnabled: true }
  ), ['feishu']);
  assert.deepEqual(getAlertChannels(
    { channels: null },
    { emailEnabled: true, feishuEnabled: false }
  ), ['email']);
});

test('builds notification text for cloud delivery', () => {
  const message = buildAlertNotification({
    symbol: 'NOK',
    asset_id: 'NOK',
    condition: 'BELOW',
    target_price: 14.4,
    note: 'watch',
  }, 14.1);

  assert.equal(message.title, '价格提醒触发：NOK');
  assert.match(message.body, /NOK 当前价格 14.1/);
  assert.match(message.body, /低于或等于 14.4/);
});
