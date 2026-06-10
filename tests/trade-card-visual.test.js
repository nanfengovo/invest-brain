import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('trade option expiration fields render as complete wrapping chips', () => {
  const card = readFileSync(new URL('../src/components/Trade/TradeCard.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/Trade/TradeCard.css', import.meta.url), 'utf8');

  assert.match(card, /getOptionExpirationParts/);
  assert.match(card, /trade-card__option-expiration-part/);
  assert.match(card, /aria-label=\{trade\.option_expiration_label\}/);
  assert.match(css, /\.trade-card__asset-name--option\s*\{[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.trade-card__option-expiration-part\s*\{[\s\S]*white-space: nowrap/);
  assert.doesNotMatch(css, /\.trade-card--compact \.trade-card__asset-name\s*\{[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(css, /\.trade-card__asset-name\s*\{[\s\S]*text-overflow: ellipsis/);
});
