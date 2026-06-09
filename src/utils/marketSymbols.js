const HK_CODE_RE = /^\d{1,5}$/;
const CN_CODE_RE = /^\d{6}$/;

const inferChinaSuffix = (code) => (/^(5|6|9)/.test(code) ? 'SS' : 'SZ');

const normalizeHongKongCode = (code) => {
  const number = Number(String(code || '').replace(/^0+/, '') || '0');
  if (!Number.isFinite(number) || number <= 0) return '';
  return String(number).padStart(4, '0');
};

export function normalizeMarketSymbol(symbol, preferredRegion = 'US') {
  const raw = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';

  if (/^GB_/.test(raw) || /^HF_/.test(raw) || raw.startsWith('^')) return raw;

  const hkPrefix = raw.match(/^HK[_-]?(\d{1,5})$/);
  if (hkPrefix) return `${normalizeHongKongCode(hkPrefix[1])}.HK`;

  const hkSuffix = raw.match(/^(\d{1,5})\.(HK|HKG)$/);
  if (hkSuffix) return `${normalizeHongKongCode(hkSuffix[1])}.HK`;

  const cnPrefix = raw.match(/^(SH|SS|SZ)[_-]?(\d{6})$/);
  if (cnPrefix) return `${cnPrefix[2]}.${cnPrefix[1] === 'SZ' ? 'SZ' : 'SS'}`;

  const cnSuffix = raw.match(/^(\d{6})\.(SH|SS|SZ|CN)$/);
  if (cnSuffix) {
    const suffix = cnSuffix[2] === 'SZ'
      ? 'SZ'
      : (cnSuffix[2] === 'CN' ? inferChinaSuffix(cnSuffix[1]) : 'SS');
    return `${cnSuffix[1]}.${suffix}`;
  }

  if (CN_CODE_RE.test(raw)) return `${raw}.${inferChinaSuffix(raw)}`;

  if (preferredRegion === 'HK' && HK_CODE_RE.test(raw)) {
    return `${normalizeHongKongCode(raw)}.HK`;
  }

  return raw;
}

export function getMarketRegion(symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  if (/\.HK$/i.test(normalized)) return 'HK';
  if (/\.(SS|SZ)$/i.test(normalized)) return 'CN';
  return 'US';
}

export function getMarketTypeLabel(symbol, fallback = '股票') {
  const region = getMarketRegion(symbol);
  if (region === 'HK') return '港股';
  if (region === 'CN') return 'A股';
  return fallback;
}

export function normalizeMarketSearchResult(item = {}, preferredRegion = 'US') {
  const symbol = normalizeMarketSymbol(item.symbol, preferredRegion);
  if (!symbol) return null;

  return {
    ...item,
    symbol,
    region: getMarketRegion(symbol),
  };
}
