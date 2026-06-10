const KNOWN_ASSET_DISPLAY_NAMES = {
  DRAM: 'Roundhill Memory ETF',
};

export function hasTrailingEllipsis(value) {
  return /(?:\.{3}|…)\s*$/u.test(String(value || '').trim());
}

export function cleanDisplayText(value) {
  return String(value || '')
    .replace(/(?:\s*(?:\.{3}|…))+$/u, '')
    .trim();
}

export function getReadableAssetName({ symbol, name, fallback = '' } = {}) {
  const cleaned = cleanDisplayText(name);
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (hasTrailingEllipsis(name) && KNOWN_ASSET_DISPLAY_NAMES[normalizedSymbol]) {
    return KNOWN_ASSET_DISPLAY_NAMES[normalizedSymbol];
  }
  return cleaned || cleanDisplayText(fallback);
}
