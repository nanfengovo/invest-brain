import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlertNotification,
  parseAlertChannels,
  shouldTriggerAlert,
} from '../api/_lib/price-alert-core.js';
import { normalizeServerAlertConfig } from '../api/_lib/server-alerts.js';

test('server price alerts trigger only when condition is met', () => {
  assert.equal(shouldTriggerAlert({ condition: 'ABOVE', target_price: 100 }, 100), true);
  assert.equal(shouldTriggerAlert({ condition: 'ABOVE', target_price: 100 }, 99.9), false);
  assert.equal(shouldTriggerAlert({ condition: 'BELOW', target_price: 100 }, 100), true);
  assert.equal(shouldTriggerAlert({ condition: 'BELOW', target_price: 100 }, 100.1), false);
  assert.equal(shouldTriggerAlert({ condition: 'BELOW', target_price: 'bad' }, 100), false);
});

test('server price alerts derive channels from alert override or notification config', () => {
  assert.deepEqual(parseAlertChannels('["feishu"]', { emailEnabled: true }), ['feishu']);
  assert.deepEqual(parseAlertChannels(null, { emailEnabled: true, feishuEnabled: true }), ['email', 'feishu']);
  assert.deepEqual(parseAlertChannels(null, { emailEnabled: false, feishuEnabled: false }), []);
});

test('server alert config only stores active alerts for cron checks', () => {
  const config = normalizeServerAlertConfig({
    userId: 'feng',
    alerts: [
      { id: 'a', status: 'ACTIVE' },
      { id: 'b', status: 'TRIGGERED' },
      { id: 'c' },
    ],
  });

  assert.equal(config.userId, 'feng');
  assert.deepEqual(config.alerts.map((alert) => alert.id), ['a', 'c']);
});

test('server alert notification payload stays readable for email and Feishu', () => {
  const payload = buildAlertNotification({
    symbol: 'AAPL',
    asset_id: 'AAPL',
    condition: 'ABOVE',
    target_price: 200,
    note: 'watch breakout',
  }, 201.25);

  assert.match(payload.title, /AAPL/);
  assert.match(payload.body, /201.25/);
  assert.match(payload.body, /watch breakout/);
});
