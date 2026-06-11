import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext, isBcryptHash } from '../utils/passwordHashing.js';

describe('password hashing guard', () => {
  it('hashes plaintext passwords with bcrypt', async () => {
    const hashed = await hashPasswordIfPlaintext('Plaintext@123', 4);

    expect(hashed).not.toBe('Plaintext@123');
    expect(isBcryptHash(hashed)).toBe(true);
    await expect(bcrypt.compare('Plaintext@123', hashed)).resolves.toBe(true);
  });

  it('does not hash an existing bcrypt hash again', async () => {
    const existingHash = await bcrypt.hash('Existing@123', 4);

    await expect(hashPasswordIfPlaintext(existingHash, 4)).resolves.toBe(existingHash);
  });
});
