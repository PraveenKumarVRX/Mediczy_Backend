export const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const wholeNumber = (value: unknown) => {
  const number = finiteNumber(value);
  return number === null ? '—' : Math.round(number).toLocaleString('en-IN');
};

export const scoreLabel = (value: unknown) => {
  const score = finiteNumber(value);
  if (score === null) return 'Not enough data yet';
  return score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention';
};

export const indiaTime = (value: string | Date | null | undefined) => {
  if (!value) return 'Not updated yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

export const slotTime = (value: unknown) => {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return String(value ?? '');
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
};

export const doctorName = (name: unknown) => {
  const clean = String(name || 'Doctor').replace(/^(?:Dr\.?\s*)+/i, '').trim();
  return clean === 'Doctor' ? clean : `Dr. ${clean}`;
};

export const reportTitle = (title: unknown, type?: unknown) => {
  const name = String(title || '').trim();
  return !name || name.length < 3 || /^(general|f|rn_image_picker|image_picker|tmp|temp|IMG_|upload)/i.test(name)
    ? String(type || 'Medical report').replace(/_/g, ' ')
    : name;
};
