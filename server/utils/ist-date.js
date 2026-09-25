/**
 * Calendar dates in India Standard Time (Asia/Kolkata, UTC+05:30, no DST).
 *
 * Audit finding FIN-05: ledger entry dates came from `new Date().toISOString().slice(0, 10)`, which is the UTC
 * date. Between 00:00 and 05:30 IST that is still "yesterday", so entries made after local midnight at a month,
 * quarter or fiscal-year boundary landed in the wrong period. Business dates in this system are IST dates.
 */
const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD for `date` (default: now) as seen in India. */
export const istDate = (date = new Date()) => IST.format(date);

export const todayIST = () => istDate(new Date());

/** Indian fiscal year (1 April – 31 March) that contains the given IST date. */
export function fiscalYearOf(dateStr = todayIST()) {
  const [y, m] = dateStr.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return { startYear, start: `${startYear}-04-01`, end: `${startYear + 1}-03-31`, label: `FY${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` };
}

/** The 12 calendar months of a fiscal year as { code: 'YYYY-MM', start, end }. */
export function fiscalMonths(startYear) {
  const out = [];
  for (let i = 0; i < 12; i += 1) {
    const month = ((3 + i) % 12) + 1;               // Apr(4) … Dec(12), Jan(1) … Mar(3)
    const year = month >= 4 ? startYear : startYear + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, '0');
    out.push({ code: `${year}-${mm}`, start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, '0')}` });
  }
  return out;
}
