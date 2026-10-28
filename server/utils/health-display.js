export function sleepHours(value, unit = 'hours') {
  const number = Number(value);
  if (value == null || !Number.isFinite(number) || number < 0) return null;
  const hours = /millisecond|^ms$/i.test(unit) ? number / 3600000 : /second|^s$/i.test(unit) ? number / 3600 : /minute|^min$/i.test(unit) ? number / 60 : number;
  return hours <= 24 ? Math.round(hours * 10) / 10 : null;
}
export const sleepScore = hours => hours == null ? null : Math.min(100, Math.round(hours / 8 * 100));
