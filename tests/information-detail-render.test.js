import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('information detail derives display content before dependent hooks', () => {
  const source = readFileSync(new URL('../src/pages/InformationDetail.jsx', import.meta.url), 'utf8');
  const displayContentIndex = source.indexOf('const displayContent = useMemo');
  const embedUrlIndex = source.indexOf('const labeledVideoEmbedUrl = useMemo');

  assert.notEqual(displayContentIndex, -1);
  assert.notEqual(embedUrlIndex, -1);
  assert.ok(
    displayContentIndex < embedUrlIndex,
    'displayContent must be declared before hooks that read it, otherwise detail pages can blank-screen during render'
  );
});
