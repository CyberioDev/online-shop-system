import type { DateRange, ListQuery } from '@/api';

export const TIME_PRESETS = [
  { key: 'all', label: 'Нийт' },
  { key: 'hour', label: 'Сүүлийн 1 цаг' },
  { key: 'fourHours', label: 'Сүүлийн 4 цаг' },
  { key: 'today', label: 'Өнөөдөр' },
  { key: 'week', label: 'Сүүлийн 7 хоног' },
] as const;
export type TimePreset = (typeof TIME_PRESETS)[number]['key'];
const HOUR = 3600000;

/** Calendar dates use the shop timezone, regardless of the device timezone. */
export function shopDay(now = new Date()) {
  return new Date(now.getTime() + 8 * HOUR).toISOString().slice(0, 10);
}

export function presetRange(preset: TimePreset, now = new Date()): ListQuery {
  if (preset === 'all') return {};
  const durations = { hour: HOUR, fourHours: 4 * HOUR, week: 7 * 24 * HOUR };
  const from = preset === 'today'
    ? new Date(`${shopDay(now)}T00:00:00+08:00`)
    : new Date(now.getTime() - durations[preset]);
  return { from: from.toISOString(), to: now.toISOString() };
}

export function customRange(days: DateRange, fromTime: string, toTime: string): ListQuery {
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(fromTime) || !clock.test(toTime)) throw new Error('Цагийг 09:00 хэлбэрээр оруулна уу.');
  const from = new Date(`${days.from}T${fromTime}:00+08:00`);
  const endMinute = new Date(`${days.to}T${toTime}:00+08:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(endMinute.getTime()) || from > endMinute) {
    throw new Error('Дуусах огноо, цаг эхлэх хугацаанаас өмнө байна.');
  }
  // The selected final minute is included; the API uses an exclusive upper bound.
  return { from: from.toISOString(), to: new Date(endMinute.getTime() + 60000).toISOString() };
}

export function rangeSummary(range: ListQuery, includeFinalMinute = false) {
  if (!range.from || !range.to) return 'Нийт';
  const from = new Date(new Date(range.from).getTime() + 8 * HOUR).toISOString();
  const to = new Date(new Date(range.to).getTime() + 8 * HOUR - (includeFinalMinute ? 60000 : 0)).toISOString();
  const start = `${Number(from.slice(5, 7))}/${Number(from.slice(8, 10))}`;
  const end = `${Number(to.slice(5, 7))}/${Number(to.slice(8, 10))}`;
  const startDate = from.slice(0, 4) === to.slice(0, 4) ? start : `${from.slice(0, 4)}/${start}`;
  const endDate = from.slice(0, 4) === to.slice(0, 4) ? end : `${to.slice(0, 4)}/${end}`;
  return `${startDate} ${from.slice(11, 16)} – ${from.slice(0, 10) === to.slice(0, 10) ? '' : `${endDate} `}${to.slice(11, 16)}`;
}
