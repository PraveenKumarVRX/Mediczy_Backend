import bcrypt from 'bcrypt';

export const isBcryptHash = (value) =>
  typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);

export async function hashPasswordIfPlaintext(value, saltRounds = 10) {
  if (!value) return value;
  if (isBcryptHash(value)) return value;
  return bcrypt.hash(value, saltRounds);
}
