import { normalizeYahooMarketSymbol } from './marketSymbols.js';

export const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json,text/plain,*/*',
};

export function mapYahooSymbol(symbol) {
  const text = String(symbol || '').trim().toUpperCase();
  const clean = normalizeYahooMarketSymbol(text);
  if (clean === 'IXIC') return '^IXIC';
  if (clean === 'NDX') return '^NDX';
  if (clean === 'INX') return '^GSPC';
  if (clean === 'DJI') return '^DJI';
  if (clean === 'NQ') return 'NQ=F';
  if (clean === 'ES') return 'ES=F';
  if (clean === 'YM') return 'YM=F';
  if (clean === 'CL') return 'CL=F';
  return clean;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchYahooChart(symbol, {
  interval = '1d',
  range = '1mo',
  includePrePost = false,
  timeoutMs = 4_500,
} = {}) {
  const yahooSymbol = mapYahooSymbol(symbol);
  const params = new URLSearchParams({
    interval,
    range,
  });

  if (includePrePost) {
    params.set('includePrePost', 'true');
  }

  const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params.toString()}`;
  const response = await fetchWithTimeout(apiUrl, { headers: YAHOO_HEADERS }, timeoutMs);

  if (!response.ok) {
    throw new Error(`Yahoo chart responded with ${response.status}`);
  }

  const data = await response.json();
  const result = data.chart?.result?.[0];
  if (!result) {
    const message = data.chart?.error?.description || 'No chart data found';
    throw new Error(message);
  }

  return { result, yahooSymbol };
}

export function compactNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Number(value);
}

export function toPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number((value * 100).toFixed(2));
}
