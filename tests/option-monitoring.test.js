import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDteMonitor,
  getMoneynessMonitor,
  parseOptionAlertInput,
} from '../src/utils/optionMonitoring.js';
import {
  getOptionReviewAttribution,
  hasOptionReviewData,
  normalizeOptionDisciplineScore,
  normalizeOptionLesson,
} from '../src/utils/optionReview.js';

const now = new Date('2026-06-08T12:00:00+08:00');

test('classifies option DTE monitoring tones', () => {
  assert.deepEqual(getDteMonitor('2026-07-18', now), {
    days: 40,
    tone: 'safe',
    label: '40DTE 安全期',
    progress: 12,
    urgent: false,
  });

  const warning = getDteMonitor('2026-06-20', now);
  assert.equal(warning.days, 12);
  assert.equal(warning.tone, 'warning');
  assert.equal(warning.urgent, false);

  const endgame = getDteMonitor('2026-06-12', now);
  assert.equal(endgame.days, 4);
  assert.equal(endgame.tone, 'endgame');
  assert.equal(endgame.urgent, true);

  const expired = getDteMonitor('2026-06-01', now);
  assert.equal(expired.tone, 'expired');
  assert.equal(expired.label, '已到期');
});

test('calculates call and put moneyness distance from strike', () => {
  const call = getMoneynessMonitor({
    underlyingPrice: 115.2,
    strikePrice: 100,
    optionType: 'CALL',
  });
  assert.equal(call.status, 'ITM');
  assert.equal(call.tone, 'itm');
  assert.equal(call.label, 'ITM 深度 +$15.20');
  assert.equal(call.underlyingPrice, 115.2);
  assert.ok(Math.abs(call.distance - 15.2) < 0.0001);

  const put = getMoneynessMonitor({
    underlyingPrice: 92.5,
    strikePrice: 100,
    optionType: 'PUT',
  });
  assert.equal(put.status, 'ITM');
  assert.equal(put.label, 'ITM 深度 +$7.50');
  assert.ok(Math.abs(put.distance - 7.5) < 0.0001);

  const otm = getMoneynessMonitor({
    underlyingPrice: 96,
    strikePrice: 100,
    optionType: 'CALL',
  });
  assert.equal(otm.status, 'OTM');
  assert.equal(otm.label, 'OTM 差距 -$4.00');
});

test('parses option alert condition shorthand', () => {
  assert.deepEqual(parseOptionAlertInput('>1.50'), {
    condition: 'ABOVE',
    target: 1.5,
  });
  assert.deepEqual(parseOptionAlertInput('跌破 0.80'), {
    condition: 'BELOW',
    target: 0.8,
  });
  assert.deepEqual(parseOptionAlertInput('$2.25', 'BELOW'), {
    condition: 'BELOW',
    target: 2.25,
  });
  assert.equal(parseOptionAlertInput('not a price'), null);
});

test('normalizes structured option review fields', () => {
  assert.equal(getOptionReviewAttribution('IV_CRUSH')?.shortLabel, 'IV Crush');
  assert.equal(normalizeOptionDisciplineScore(120), 100);
  assert.equal(normalizeOptionDisciplineScore(0), 1);
  assert.equal(normalizeOptionDisciplineScore('x'), null);
  assert.equal(normalizeOptionLesson('下次财报前绝不裸买当周 Call', 10), '下次财报前绝不裸买当');
  assert.equal(hasOptionReviewData({ optionAttribution: 'THETA_DECAY' }), true);
  assert.equal(hasOptionReviewData({}), false);
});
