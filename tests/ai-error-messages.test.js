import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiErrorMessage, getEmptyOcrMessage } from '../src/utils/aiErrorMessages.js';

test('OCR empty result guides manual correction', () => {
  assert.match(getEmptyOcrMessage(), /未识别到完整交易信息/);
  assert.match(getEmptyOcrMessage(), /手动补全/);
});

test('OCR rate limit message suggests retry and manual fallback', () => {
  const message = getAiErrorMessage(new Error('OCR API error: 429'), 'ocr');
  assert.match(message, /额度|并发/);
  assert.match(message, /稍后重试/);
  assert.match(message, /手动补全/);
});

test('OCR temporary outage keeps reference-image workflow useful', () => {
  const message = getAiErrorMessage('503 Service Unavailable', 'ocr');
  assert.match(message, /模型暂时繁忙/);
  assert.match(message, /参考截图已保留/);
});

test('AI insight rate limit avoids raw HTTP error copy', () => {
  const message = getAiErrorMessage('HTTP 429 Too Many Requests', 'insights');
  assert.match(message, /请求过于密集/);
  assert.match(message, /稍后重试/);
  assert.doesNotMatch(message, /HTTP 429/);
});
