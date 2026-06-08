import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('summarize api translate mode keeps markdown structure and Chinese output instruction', () => {
  const source = readFileSync(new URL('../api/summarize.js', import.meta.url), 'utf8');

  assert.match(source, /mode === 'translate'/);
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
  assert.match(source, /'翻译中文'/);
  assert.match(source, /mode: 'translate'/);
  assert.match(source, /readerContent=\{activeReaderContent\}/);
  assert.match(source, /getSummarizeApiUrl\(Boolean\(localApiKey\)\)/);
  assert.match(source, /BUILTIN_AI_API_BASE_URL/);
  assert.match(source, /localHosts\.has\(window\.location\.hostname\)/);
});

test('information translation cleans source scaffold and reports failures clearly', () => {
  const source = readFileSync(new URL('../src/pages/InformationDetail.jsx', import.meta.url), 'utf8');

  assert.match(source, /cleanContentForTranslation/);
  assert.match(source, /URL Source:/);
  assert.match(source, /Published Time:/);
  assert.match(source, /Post\|Conversation/);
  assert.match(source, /模型没有返回翻译正文，请稍后重试/);
  assert.match(source, /toast\.close\(\);\s*Toast\.show\(\{ icon: 'fail'/);
});
