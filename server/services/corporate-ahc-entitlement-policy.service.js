const DAY = 24 * 60 * 60 * 1000;

const iso = (date) => date.toISOString().slice(0, 10);
const dateOnly = (value, field) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw Object.assign(new Error(`${field} must be YYYY-MM-DD`), { status: 400 });
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || iso(date) !== value) throw Object.assign(new Error(`${field} must be a valid date`), { status: 400 });
  return date;
};

export function validityDays(validityPeriod) {
  const match = /^(\d+)\s*days?$/i.exec(String(validityPeriod || '').trim());
  if (!match || Number(match[1]) < 1) throw Object.assign(new Error('AHC packages require a positive day-based validity period'), { status: 400 });
  return Number(match[1]);
}

export function ahcWindow({ assignedOn, validityPeriod, corporateValidFrom, corporateValidTo }) {
  const start = dateOnly(assignedOn, 'assignedOn');
  const corporateStart = dateOnly(corporateValidFrom, 'corporateValidFrom');
  const corporateEnd = dateOnly(corporateValidTo, 'corporateValidTo');
  if (corporateEnd < corporateStart) throw Object.assign(new Error('Corporate validity end must not precede its start'), { status: 400 });
  const effectiveStart = start > corporateStart ? start : corporateStart;
  if (effectiveStart > corporateEnd) throw Object.assign(new Error('The corporate AHC window has ended'), { status: 409 });
  const duration = validityDays(validityPeriod);
  const personalEnd = new Date(effectiveStart.getTime() + duration * DAY);
  return { validFrom: iso(effectiveStart), validTo: iso(personalEnd > corporateEnd ? corporateEnd : personalEnd), validityDays: duration };
}

export function ahcExtension({ currentValidTo, corporateValidTo, extensionDays, maxExtensionDays = 15 }) {
  const current = dateOnly(currentValidTo, 'currentValidTo');
  const corporateEnd = dateOnly(corporateValidTo, 'corporateValidTo');
  const requested = Number(extensionDays);
  if (!Number.isInteger(requested) || requested < 1 || requested > Math.min(15, Number(maxExtensionDays) || 15)) throw Object.assign(new Error('An AHC extension must be between 1 and 15 days'), { status: 400 });
  const next = new Date(Math.min(current.getTime() + requested * DAY, corporateEnd.getTime()));
  if (next <= current) throw Object.assign(new Error('The corporate AHC window cannot be extended further'), { status: 409 });
  return { oldValidTo: iso(current), newValidTo: iso(next), grantedDays: Math.round((next - current) / DAY) };
}
