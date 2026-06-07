const NEW_YORK_TIME_ZONE = 'America/New_York';
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;
const PRE_MARKET_OPEN_MINUTES = 4 * 60;
const AFTER_HOURS_CLOSE_MINUTES = 20 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(year, month, day, delta) {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getWeekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const firstDay = getWeekday(year, month, 1);
  const offset = (weekday - firstDay + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = getWeekday(year, month, lastDate);
  return lastDate - ((lastDay - weekday + 7) % 7);
}

function getObservedHoliday(year, month, day) {
  const weekday = getWeekday(year, month, day);
  if (weekday === 6) return addDays(year, month, day, -1);
  if (weekday === 0) return addDays(year, month, day, 1);
  return { year, month, day };
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function getGoodFriday(year) {
  const easter = getEasterSunday(year);
  return addDays(easter.year, easter.month, easter.day, -2);
}

function addHoliday(holidays, holiday) {
  holidays.add(dateKey(holiday.year, holiday.month, holiday.day));
}

function getMarketHolidays(year) {
  const holidays = new Set();

  addHoliday(holidays, getObservedHoliday(year, 1, 1));
  addHoliday(holidays, {
    year,
    month: 1,
    day: nthWeekdayOfMonth(year, 1, 1, 3),
  });
  addHoliday(holidays, {
    year,
    month: 2,
    day: nthWeekdayOfMonth(year, 2, 1, 3),
  });
  addHoliday(holidays, getGoodFriday(year));
  addHoliday(holidays, {
    year,
    month: 5,
    day: lastWeekdayOfMonth(year, 5, 1),
  });
  addHoliday(holidays, getObservedHoliday(year, 6, 19));
  addHoliday(holidays, getObservedHoliday(year, 7, 4));
  addHoliday(holidays, {
    year,
    month: 9,
    day: nthWeekdayOfMonth(year, 9, 1, 1),
  });
  addHoliday(holidays, {
    year,
    month: 11,
    day: nthWeekdayOfMonth(year, 11, 4, 4),
  });
  addHoliday(holidays, getObservedHoliday(year, 12, 25));

  return holidays;
}

function getEarlyCloseDates(year) {
  const earlyCloses = new Set();
  const holidays = getMarketHolidays(year);
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  const dayAfterThanksgiving = addDays(year, 11, thanksgiving, 1);
  const christmasEve = { year, month: 12, day: 24 };
  const independenceEve = { year, month: 7, day: 3 };

  [dayAfterThanksgiving, christmasEve, independenceEve].forEach((date) => {
    const key = dateKey(date.year, date.month, date.day);
    const weekday = getWeekday(date.year, date.month, date.day);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(key)) {
      earlyCloses.add(key);
    }
  });

  return earlyCloses;
}

export function getNewYorkDateParts(date = new Date()) {
  const parts = nyFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: parts.weekday,
    key: dateKey(year, month, day),
    minutes: hour * 60 + minute,
  };
}

export function getUsMarketStatus(date = new Date()) {
  const ny = getNewYorkDateParts(date);
  const weekday = getWeekday(ny.year, ny.month, ny.day);
  const holidays = getMarketHolidays(ny.year);
  const earlyCloses = getEarlyCloseDates(ny.year);
  const isWeekend = weekday === 0 || weekday === 6;

  if (isWeekend || holidays.has(ny.key)) {
    return {
      phase: 'closed',
      label: '休市',
      detail: '美股休市',
      isOpen: false,
      isTradingDay: false,
      ny,
    };
  }

  const closeMinutes = earlyCloses.has(ny.key) ? EARLY_CLOSE_MINUTES : MARKET_CLOSE_MINUTES;

  if (ny.minutes >= MARKET_OPEN_MINUTES && ny.minutes < closeMinutes) {
    return {
      phase: 'regular',
      label: '交易中',
      detail: '美股常规交易',
      isOpen: true,
      isTradingDay: true,
      ny,
    };
  }

  if (ny.minutes >= PRE_MARKET_OPEN_MINUTES && ny.minutes < MARKET_OPEN_MINUTES) {
    return {
      phase: 'pre',
      label: '盘前',
      detail: '美股盘前交易',
      isOpen: false,
      isTradingDay: true,
      ny,
    };
  }

  if (ny.minutes >= closeMinutes && ny.minutes < AFTER_HOURS_CLOSE_MINUTES) {
    return {
      phase: 'after',
      label: '盘后',
      detail: '美股盘后交易',
      isOpen: false,
      isTradingDay: true,
      ny,
    };
  }

  return {
    phase: 'closed',
    label: '休市',
    detail: '美股休市',
    isOpen: false,
    isTradingDay: true,
    ny,
  };
}
