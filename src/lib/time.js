// Times are stored as ISO UTC and always displayed in Europe/London.
const TZ = 'Europe/London';

/** @param {string} iso @param {Intl.DateTimeFormatOptions} opts */
const fmt = (iso, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(new Date(iso));

/** e.g. "Fri 24 Oct" */
export const formatDay = (/** @type {string} */ iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });

/** e.g. "Friday 24 October" */
export const formatDayLong = (/** @type {string} */ iso) =>
  fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });

/** e.g. "10:30 pm" */
export const formatTime = (/** @type {string} */ iso) => fmt(iso, { hour: 'numeric', minute: '2-digit', hour12: true });

/** e.g. "24 Oct, 10:30 pm" */
export const formatDateTime = (/** @type {string} */ iso) =>
  fmt(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** The London calendar date as YYYY-MM-DD. */
export const londonYmd = (/** @type {Date | string} */ d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));

/** London weekday, 0 = Sunday. */
export const londonWeekday = (/** @type {Date | string} */ d) => {
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(new Date(d));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
};

/** "Tonight", "Tomorrow" or the day label. @param {string} iso @param {Date} [now] */
export function dayLabel(iso, now = new Date()) {
  const target = londonYmd(iso);
  if (target === londonYmd(now)) return 'Tonight';
  if (target === londonYmd(new Date(now.getTime() + 86400000))) return 'Tomorrow';
  return formatDay(iso);
}

/** "in 3h", "2 days ago". @param {string} iso @param {Date} [now] */
export function relativeTime(iso, now = new Date()) {
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : hours < 48 ? `${hours}h` : `${days} days`;
  if (label === 'just now') return label;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

/** Minutes London is ahead of UTC at a given instant (60 in BST, 0 in GMT). @param {number} utcMs */
function londonOffsetMinutes(utcMs) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (/** @type {string} */ t) => Number(parts.find((p) => p.type === t)?.value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - utcMs) / 60000;
}

/** The UTC instant for a London wall-clock time, e.g. londonToUtc('2026-10-24', 22, 30) -> ISO. Handles BST/GMT. @param {string} ymd @param {number} hh @param {number} [mm] */
export function londonToUtc(ymd, hh, mm = 0) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let ms = wall - londonOffsetMinutes(wall) * 60000;
  ms = wall - londonOffsetMinutes(ms) * 60000; // second pass settles dates near a clock change
  return new Date(ms).toISOString();
}

/** @param {string} ymd @param {number} days */
export function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
