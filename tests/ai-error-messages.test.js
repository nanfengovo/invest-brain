import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('information summarize empty input keeps book import guidance in Chinese', () => {
  const formSource = readFileSync(new URL('../src/components/Information/InformationForm.jsx', import.meta.url), 'utf8');
  const apiSource = readFileSync(new URL('../api/summarize.js', import.meta.url), 'utf8');

  assert.match(formSource, /请先上传 PDF\/EPUB，或填写来源链接\/正文摘录后再解析书籍\/研报/);
  assert.match(formSource, /silent = false/);
  assert.match(formSource, /onBlur=\{\(\) => triggerAiSummarize\(null, null, \{ silent: true \}\)\}/);
  assert.match(apiSource, /请提供来源链接、正文内容或图片后再解析。书籍\/研报请先上传 PDF\/EPUB 或填写摘录。/);
  assert.doesNotMatch(apiSource, /Please provide either url, content, or image/);
});
