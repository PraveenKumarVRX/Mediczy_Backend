import { jest } from '@jest/globals';
import {
  generateUniqueIdForModel,
  getPrefixForRole,
  getRoleFromUniqueId,
  isUniqueIdCompatibleWithRole,
} from '../utils/uniqueIdGenerator.js';

describe('unique ID generator', () => {
  it('maps login roles to stable public-ID prefixes', () => {
    expect(getPrefixForRole('doctor')).toBe('D');
    expect(getPrefixForRole('nurse')).toBe('N');
    expect(getPrefixForRole('assistant')).toBe('A');
    expect(getPrefixForRole('lab')).toBe('L');
    expect(getPrefixForRole('pharmacy')).toBe('P');
    expect(getPrefixForRole('corporate')).toBe('C');
    expect(getPrefixForRole('hospital')).toBe('H');
    expect(getPrefixForRole('insurance_company')).toBe('I');
    expect(getPrefixForRole('insurance_broker')).toBe('V');
    expect(getPrefixForRole('finance_staff')).toBe('T');
  });

  it('resolves public ID prefixes back to role families', () => {
    expect(getRoleFromUniqueId('DABCDE')).toBe('doctor');
    expect(getRoleFromUniqueId('EABCDE')).toBe('corporate_employee');
    expect(getRoleFromUniqueId('VABCDE')).toBe('insurance_broker');
    expect(isUniqueIdCompatibleWithRole('DABCDE', 'doctor')).toBe(true);
    expect(isUniqueIdCompatibleWithRole('DABCDE', 'nurse')).toBe(false);
  });

  it('retries when a generated ID collides in the target model', async () => {
    const seen = [];
    const model = {
      findOne: jest.fn(async ({ where }) => {
        seen.push(where.unique_id);
        return seen.length === 1 ? { id: 1 } : null;
      }),
    };

    const id = await generateUniqueIdForModel(model, 'doctor');

    expect(id).toMatch(/^D[A-Z0-9]{5}$/);
    expect(model.findOne).toHaveBeenCalledTimes(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
