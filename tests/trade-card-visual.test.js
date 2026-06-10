import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('trade option expiration fields render as complete wrapping chips', () => {
  const card = readFileSync(new URL('../src/components/Trade/TradeCard.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/Trade/TradeCard.css', import.meta.url), 'utf8');

  assert.match(card, /getOptionExpirationParts/);
  assert.match(card, /trade-card__option-expiration-part/);
  assert.match(card, /trade-card__option-expiration-part--\$\{part\.type\}/);
  assert.match(card, /type: index === 0 && \/\^EXP:\/i\.test\(text\) \? 'date' : 'risk'/);
  assert.match(card, /aria-label=\{trade\.option_expiration_label\}/);
  assert.match(css, /\.trade-card__asset-name--option\s*\{[\s\S]*width: 100%/);
  assert.match(css, /\.trade-card__asset-name--option\s*\{[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.trade-card__option-expiration-part\s*\{[\s\S]*white-space: normal/);
  assert.match(css, /\.trade-card__option-expiration-part\s*\{[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.trade-card__option-expiration-part\s*\{[\s\S]*text-overflow: clip/);
  assert.match(css, /\.trade-card__option-expiration-part--risk\s*\{[\s\S]*font-weight: 750/);
  assert.match(css, /\.trade-card--compact \.trade-card__right\s*\{[\s\S]*width: clamp\(64px, 20vw, 80px\)/);
  assert.match(css, /\[data-theme='light'\] \.trade-card/);
  assert.doesNotMatch(css, /\.trade-card--compact \.trade-card__asset-name\s*\{[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(css, /\.trade-card__asset-name\s*\{[\s\S]*text-overflow: ellipsis/);
});

test('holding option expiration uses the same complete chip treatment', () => {
  const card = readFileSync(new URL('../src/components/Holdings/HoldingCard.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/Holdings/HoldingCard.css', import.meta.url), 'utf8');

  assert.match(card, /getOptionExpirationParts/);
  assert.match(card, /holding-card__expiration-part/);
  assert.match(card, /holding-card__expiration-part--\$\{part\.type\}/);
  assert.match(card, /type: index === 0 && \/\^EXP:\/i\.test\(text\) \? 'date' : 'risk'/);
  assert.match(card, /aria-label=\{optionExpirationLabel\}/);
  assert.match(card, /getReadableAssetName/);
  assert.match(css, /\.holding-card__expiration\s*\{[\s\S]*width: 100%/);
  assert.match(css, /\.holding-card__expiration\s*\{[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.holding-card__expiration\s*\{[\s\S]*background: transparent/);
  assert.match(css, /\.holding-card__expiration-part\s*\{[\s\S]*white-space: normal/);
  assert.match(css, /\.holding-card__expiration-part\s*\{[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.holding-card__expiration-part\s*\{[\s\S]*text-overflow: clip/);
  assert.match(css, /\.holding-card__expiration-part--risk\s*\{[\s\S]*font-weight: 750/);
  assert.doesNotMatch(css, /\.holding-card__expiration-part\s*\{[\s\S]*text-overflow: ellipsis/);
});
