const HK_CODE_RE = /^\d{1,5}$/;
const CN_CODE_RE = /^\d{6}$/;

const inferChinaSuffix = (code) => (/^(5|6|9)/.test(code) ? 'SS' : 'SZ');

const normalizeHongKongCode = (code) => {
  const number = Number(String(code || '').replace(/^0+/, '') || '0');
  if (!Number.isFinite(number) || number <= 0) return '';
  return String(number).padStart(4, '0');
};

export function normalizeYahooMarketSymbol(symbol, preferredRegion = 'US') {
  const raw = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';

  const withoutPrefix = raw.replace(/^(GB_|HF_|US)/i, '');
  if (withoutPrefix.startsWith('^')) return withoutPrefix;

  const hkPrefix = withoutPrefix.match(/^HK[_-]?(\d{1,5})$/);
  if (hkPrefix) return `${normalizeHongKongCode(hkPrefix[1])}.HK`;

  const hkSuffix = withoutPrefix.match(/^(\d{1,5})\.(HK|HKG)$/);
  if (hkSuffix) return `${normalizeHongKongCode(hkSuffix[1])}.HK`;

  const cnPrefix = withoutPrefix.match(/^(SH|SS|SZ)[_-]?(\d{6})$/);
  if (cnPrefix) return `${cnPrefix[2]}.${cnPrefix[1] === 'SZ' ? 'SZ' : 'SS'}`;

  const cnSuffix = withoutPrefix.match(/^(\d{6})\.(SH|SS|SZ|CN)$/);
  if (cnSuffix) {
    const suffix = cnSuffix[2] === 'SZ'
      ? 'SZ'
      : (cnSuffix[2] === 'CN' ? inferChinaSuffix(cnSuffix[1]) : 'SS');
    return `${cnSuffix[1]}.${suffix}`;
  }

  if (CN_CODE_RE.test(withoutPrefix)) return `${withoutPrefix}.${inferChinaSuffix(withoutPrefix)}`;

  if (preferredRegion === 'HK' && HK_CODE_RE.test(withoutPrefix)) {
    return `${normalizeHongKongCode(withoutPrefix)}.HK`;
  }

  return withoutPrefix;
}

export function getMarketRegion(symbol) {
  const normalized = normalizeYahooMarketSymbol(symbol);
  if (/\.HK$/i.test(normalized)) return 'HK';
  if (/\.(SS|SZ)$/i.test(normalized)) return 'CN';
  return 'US';
}

export function toLongbridgeMarketSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  const hkPlain = raw.match(/^(\d{1,5})$/);
  if (hkPlain) return `${hkPlain[1].padStart(5, '0')}.HK`;

  const hkPrefixed = raw.match(/^HK[_-]?(\d{1,5})$/);
  if (hkPrefixed) return `${hkPrefixed[1].padStart(5, '0')}.HK`;

  const normalized = normalizeYahooMarketSymbol(raw);
  if (!normalized) return '';
  if (/\.SS$/i.test(normalized)) return normalized.replace(/\.SS$/i, '.SH');
  return normalized;
}
