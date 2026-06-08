import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOcrResult } from '../src/utils/ocrWorker.js';
import { OCR_PROGRESS_PHASES, buildOcrSuccessMessage } from '../src/utils/ocrStatus.js';

test('OCR progress phases do not claim model fallback or queueing', () => {
  const joined = OCR_PROGRESS_PHASES.join(' ');
  assert.doesNotMatch(joined, /繁忙|排队|备用|切换/);
});

test('OCR success copy reflects real fallback metadata', () => {
  const message = buildOcrSuccessMessage({
    trades: [{ symbol: 'NVDA' }],
    meta: {
      modelUsed: 'gemini-3.1-flash-lite',
      requestedModel: 'gemini-3.5-flash',
      fallbackUsed: true,
      retryCount: 2,
    },
  });

  assert.match(message, /主模型响应异常/);
  assert.match(message, /3.1 Lite/);
  assert.match(message, /识别到 1 笔交易/);
});

test('OCR normalization keeps model metadata for UI status', () => {
  const result = normalizeOcrResult({
    trades: [{ symbol: 'stm', status: '全部成交', quantity: 1, price: 20 }],
    model_used: 'gemini-3.5-flash',
    requested_model: 'gemini-3.5-flash',
    fallback_used: false,
    retry_count: 0,
    attempted_models: ['gemini-3.5-flash'],
  });

  assert.equal(result.meta.modelUsed, 'gemini-3.5-flash');
  assert.equal(result.meta.fallbackUsed, false);
  assert.deepEqual(result.meta.attemptedModels, ['gemini-3.5-flash']);
});
