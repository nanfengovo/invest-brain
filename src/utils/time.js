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
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getIsoWeekInfo(date) {
  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((normalized - yearStart) / 86400000) + 1) / 7);
  return {
    year: normalized.getUTCFullYear(),
    week,
  };
}

export function toDateGroupKey(value, groupBy = 'DAY', fallback = '未记录日期') {
  const date = parseDateTime(value);
  if (!date) return fallback;

  if (groupBy === 'MONTH') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  if (groupBy === 'WEEK') {
    const { year, week } = getIsoWeekInfo(date);
    return `${year} 第 ${String(week).padStart(2, '0')} 周`;
  }

  return toDateKey(date, fallback);
}
