import { describe, expect, it } from 'vitest';
import { notificationText } from './notification-text';
describe('notification doctor titles', () => {
  it('normalizes historical duplicate titles in sentences', () => {
    expect(notificationText('Appointment with Dr. Dr. Hamid Shinde')).toBe('Appointment with Dr. Hamid Shinde');
  });
  it('handles repeated titles without changing spelling', () => {
    expect(notificationText('Dr Dr. dr Hamid Shinde')).toBe('Dr. Hamid Shinde');
  });
  it('preserves normal titles and unrelated text', () => {
    expect(notificationText('Dr. Hamid Shinde: CBC ready')).toBe('Dr. Hamid Shinde: CBC ready');
  });
});
