/**
 * Formatting helpers. Mongolian names are spelled out here instead of using
 * Intl locale data, which is not guaranteed on every JS engine the app runs on.
 */

const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
export const WEEKDAYS_SHORT_MON_FIRST = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 1240000 → "1,240,000₮" */
export function formatMoney(amount: number) {
  return `${formatNumber(amount)}₮`;
}

export function formatNumber(value: number) {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "Бямба, 9-р сарын 19" */
export function formatLongDate(date: Date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getMonth() + 1}-р сарын ${date.getDate()}`;
}

/** "2026 оны 9-р сар" */
export function formatMonthYear(year: number, monthIndex: number) {
  return `${year} оны ${monthIndex + 1}-р сар`;
}

/** "9/19" */
export function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** "14:32" */
export function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "2026-09-19 14:32" — used in exports. */
export function formatDateTime(date: Date) {
  return `${toDayKey(date)} ${formatTime(date)}`;
}

/** Compact age of an event: "2 мин", "3 цаг", "Өчигдөр", "9/12". */
export function formatRelative(iso: string, now = new Date()) {
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Дөнгөж сая';
  if (minutes < 60) return `${minutes} мин`;
  if (isSameDay(date, now)) return `${Math.floor(minutes / 60)} цаг`;
  if (isSameDay(date, addDays(now, -1))) return 'Өчигдөр';
  return formatShortDate(date);
}

// ---------- Calendar days ----------

/** Local calendar day as "YYYY-MM-DD". */
export function toDayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses "YYYY-MM-DD" as local midnight. */
export function fromDayKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date) {
  return toDayKey(a) === toDayKey(b);
}

/** "9/13 – 9/19", or a single day "9/19". */
export function formatRangeShort(from: string, to: string) {
  const a = fromDayKey(from);
  const b = fromDayKey(to);
  if (from === to) return formatShortDate(a);
  const sameYear = a.getFullYear() === b.getFullYear();
  const prefix = sameYear ? '' : `${a.getFullYear()}/`;
  const suffix = sameYear ? '' : `${b.getFullYear()}/`;
  return `${prefix}${formatShortDate(a)} – ${suffix}${formatShortDate(b)}`;
}
