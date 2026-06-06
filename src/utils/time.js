export function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

export function toIsoDateTime(value, fallback = new Date()) {
  const date = parseDateTime(value) || parseDateTime(fallback) || new Date();
  return date.toISOString();
}

export function toDateKey(value, fallback = '未知日期') {
  const date = parseDateTime(value);
  if (!date) return fallback;
  return date.toISOString().slice(0, 10);
}
