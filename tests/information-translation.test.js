import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('summarize api translate mode keeps markdown structure and Chinese output instruction', () => {
  const source = readFileSync(new URL('../api/summarize.js', import.meta.url), 'utf8');

  assert.match(source, /mode === 'translate'/);
  assert.match(source, /splitTranslateChunks/);
  assert.match(source, /chunk_count/);
  assert.match(source, /translated_chunks/);
  assert.match(source, /保留 Markdown 段落、标题、列表、引用等结构/);
  assert.match(source, /只输出翻译后的中文正文/);
  assert.match(source, /x-gemini-api-key/);
  assert.match(source, /x-nvidia-api-key/);
  assert.match(source, /请先在设置页面配置 Gemini API Key 或 NVIDIA API Key/);
});

test('information detail reader exposes Chinese and original toggles', () => {
  const source = readFileSync(new URL('../src/pages/InformationDetail.jsx', import.meta.url), 'utf8');

  assert.match(source, /handleTranslateReader/);
  assert.match(source, /autoTitleTranslation/);
  assert.match(source, /displayTitle/);
  assert.match(source, /shouldAutoTranslateText/);
  assert.match(source, /getCachedInformationTranslation/);
  assert.match(source, /saveInformationTranslation/);
  assert.match(source, /translateTextToChinese/);
  assert.match(source, /translateTextToChineseInChunks/);
  assert.match(source, /autoReaderTranslationProgress/);
  assert.match(source, /setReaderMode\('translated'\)/);
  assert.match(source, /中文翻译/);
  assert.match(source, />原文</);
  assert.match(source, /'翻译中文'/);
  assert.match(source, /readerContent=\{activeReaderContent\}/);
  assert.match(source, /正在分段翻译中文\.\.\. \$\{completed\}\/\$\{total\}/);
  assert.match(source, /自动翻译正文/);
  assert.match(source, /自动翻译失败，可手动重试/);
  assert.match(source, /chunkTimeoutMs: 18000/);
  assert.match(source, /armReaderWatchdog/);
  assert.match(source, /22000/);
  assert.doesNotMatch(source, /getSummarizeApiUrl\(Boolean\(localGeminiKey \|\| localNvidiaKey\)\)/);
  assert.doesNotMatch(source, /const BUILTIN_AI_API_BASE_URL/);
});

test('information translation cleans source scaffold and reports failures clearly', () => {
  const source = readFileSync(new URL('../src/pages/InformationDetail.jsx', import.meta.url), 'utf8');

  assert.match(source, /cleanContentForTranslation/);
  assert.match(source, /URL Source:/);
  assert.match(source, /Published Time:/);
  assert.match(source, /Post\|Conversation/);
  assert.match(source, /模型没有返回翻译正文，请稍后重试/);
  assert.match(source, /正在分段翻译中文/);
  assert.match(source, /分段翻译完成/);
  assert.doesNotMatch(source, /已翻译前半部分正文/);
  assert.match(source, /toast\.close\(\);\s*Toast\.show\(\{ icon: 'fail'/);
});

test('information detail page uses mobile PWA safe viewport sizing', () => {
  const source = readFileSync(new URL('../src/pages/InformationDetail.css', import.meta.url), 'utf8');

  assert.match(source, /100dvh/);
  assert.match(source, /100svh/);
  assert.match(source, /-webkit-overflow-scrolling: touch/);
  assert.match(source, /overscroll-behavior: contain/);
});

test('information list auto-translates non-Chinese titles with local cache', () => {
  const list = readFileSync(new URL('../src/pages/InformationPage.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/InformationPage.css', import.meta.url), 'utf8');
  const util = readFileSync(new URL('../src/utils/informationAutoTranslation.js', import.meta.url), 'utf8');

  assert.match(list, /titleTranslations/);
  assert.match(list, /titleTranslationRequestsRef/);
  assert.match(list, /shouldAutoTranslateText\(info\.title\)/);
  assert.match(list, /translateTextToChinese/);
  assert.match(list, /saveInformationTranslation/);
  assert.match(list, /displayTitle/);
  assert.match(list, /info-row__translation-state/);
  assert.match(css, /info-row__translation-state/);
  assert.match(util, /ib_information_translation_cache_v1/);
  assert.match(util, /BUILTIN_AI_API_BASE_URL/);
  assert.match(util, /splitInformationTranslationChunks/);
  assert.match(util, /translateTextToChineseInChunks/);
  assert.match(util, /TRANSLATION_CHUNK_CHARS = 2800/);
  assert.match(util, /MAX_CLIENT_TRANSLATION_CHUNKS/);
  assert.match(util, /翻译请求超时，请稍后重试/);
  assert.match(util, /Promise\.race/);
  assert.match(util, /localHosts\.has\(window\.location\.hostname\)/);
  assert.match(util, /mode: 'translate'/);
  assert.match(util, /buildAiRequestBody/);
  assert.match(util, /buildAiRequestHeaders/);
});
