import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('translate api keeps markdown structure and Chinese output instruction', () => {
  const source = readFileSync(new URL('../api/translate.js', import.meta.url), 'utf8');

  assert.match(source, /保留 Markdown 段落、标题、列表、引用等结构/);
  assert.match(source, /只输出翻译后的中文正文/);
  assert.match(source, /x-gemini-api-key/);
  assert.match(source, /请先在设置页面配置 Gemini API Key/);
});

test('information detail reader exposes Chinese and original toggles', () => {
  const source = readFileSync(new URL('../src/pages/InformationDetail.jsx', import.meta.url), 'utf8');

  assert.match(source, /handleTranslateReader/);
  assert.match(source, /中文翻译/);
  assert.match(source, />原文</);
  assert.match(source, /readerContent=\{activeReaderContent\}/);
});
