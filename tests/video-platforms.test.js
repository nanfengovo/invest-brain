import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVideoPlatform,
  getBilibiliId,
  getVimeoId,
  getYouTubeId,
} from '../src/utils/videoPlatforms.js';

test('detects YouTube watch and short links with HD embed preference', () => {
  assert.equal(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(getYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');

  const platform = detectVideoPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(platform.platform, 'youtube');
  assert.match(platform.embedUrl, /youtube\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(platform.embedUrl, /vq=hd1080/);
});

test('detects Bilibili and Vimeo links for in-app iframe playback', () => {
  assert.equal(getBilibiliId('https://www.bilibili.com/video/BV1xx411c7mD/'), 'BV1xx411c7mD');
  assert.equal(getVimeoId('https://vimeo.com/123456789'), '123456789');

  const bilibili = detectVideoPlatform('https://www.bilibili.com/video/BV1xx411c7mD/');
  assert.equal(bilibili.platform, 'bilibili');
  assert.match(bilibili.embedUrl, /high_quality=1/);

  const vimeo = detectVideoPlatform('https://vimeo.com/123456789');
  assert.equal(vimeo.platform, 'vimeo');
  assert.match(vimeo.embedUrl, /quality=1080p/);
});
