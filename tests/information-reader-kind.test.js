import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInformationReaderKind } from '../src/utils/informationReaderKind.js';

test('article records with saved text prefer the in-app markdown reader over X embeds', () => {
  const kind = resolveInformationReaderKind({
    infoType: 'ARTICLE',
    cleanContent: '这是一段已经保存到本地的文章正文。',
    twitterPostId: '1790000000000000000',
    validUrl: 'https://x.com/example/status/1790000000000000000',
  });

  assert.equal(kind, 'markdown');
});

test('X links without saved article content still use the X post reader', () => {
  const kind = resolveInformationReaderKind({
    infoType: 'ARTICLE',
    cleanContent: '',
    twitterPostId: '1790000000000000000',
    validUrl: 'https://x.com/example/status/1790000000000000000',
  });

  assert.equal(kind, 'xpost');
});

test('HTML article records prefer the in-app HTML reader', () => {
  const kind = resolveInformationReaderKind({
    infoType: 'ARTICLE',
    cleanContent: '<article><p>正文</p></article>',
    isHtmlContent: true,
    twitterPostId: '1790000000000000000',
    validUrl: 'https://x.com/example/status/1790000000000000000',
  });

  assert.equal(kind, 'html');
});

test('video records with platform embeds use the in-app video reader', () => {
  const kind = resolveInformationReaderKind({
    infoType: 'VIDEO',
    cleanContent: '',
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?vq=hd1080',
    videoPlatform: { platform: 'youtube' },
    validUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });

  assert.equal(kind, 'video');
});
