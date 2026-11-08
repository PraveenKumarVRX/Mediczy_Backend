/**
 * Recognise seeded placeholder contact details so they are never presented as
 * real ones.
 *
 * 2,363 of 2,428 rows in `labs` carry a phone from a sequential
 * +91-90000000xx range, and QA reported the app showing "+91-9000000057" as a
 * lab's contact number. That is not a harmless typo: 9xxxxxxxxx is a live
 * Indian mobile series, so a patient tapping Call can reach an unrelated
 * person. Showing nothing, and saying so, is the honest answer until real
 * numbers are sourced.
 *
 * This hides the value at the API boundary. It changes no stored data — the
 * rows still need fixing, and `placeholder: true` in the payload is what makes
 * that visible rather than silently swallowed.
 */

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Sequential seed ranges, repeated digits and the usual fake numbers.
 * Indian numbers are matched with or without the 91 country code.
 */
export function isPlaceholderPhone(value) {
  const digits = digitsOf(value);
  if (!digits) return false;

  const local = digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
  if (local.length < 6) return true; // too short to be dialable

  // 9000000001 … 9000000999 — the seeded range.
  if (/^9000000\d{3}$/.test(local)) return true;
  // 0000000000, 9999999999, and any single digit repeated.
  if (/^(\d)\1+$/.test(local)) return true;
  // 1234567890 / 0987654321 and the classic 9876543210 seed.
  if (['1234567890', '0987654321', '9876543210'].includes(local)) return true;
  // A long run of zeros is always seed data, never a real number.
  if (/0{6,}/.test(local)) return true;

  return false;
}

/** Addresses that are obviously not a real inbox. */
export function isPlaceholderEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return false;
  return /@(example|test|localhost|invalid|placeholder)\b/.test(email)
    || /^(no-?reply|donotreply|dummy|placeholder|test)@/.test(email);
}

/**
 * @returns {{phone: string|null, email: string|null, placeholder: boolean}}
 *   the values fit to show, and whether anything was withheld.
 */
export function sanitiseContact({ phone, email } = {}) {
  const phoneIsFake = isPlaceholderPhone(phone);
  const emailIsFake = isPlaceholderEmail(email);
  return {
    phone: phoneIsFake || !phone ? null : String(phone).trim(),
    email: emailIsFake || !email ? null : String(email).trim(),
    placeholder: phoneIsFake || emailIsFake,
  };
}

export default { isPlaceholderPhone, isPlaceholderEmail, sanitiseContact };
