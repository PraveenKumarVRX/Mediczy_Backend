import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('patient health-checkup booking contract', () => {
  test('migration is registered and persists the booking lifecycle', () => {
    const migration = read('migrations/20261015006000-health-checkup-bookings.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS health_checkup_bookings');
    expect(migration).toContain('package_snapshot JSONB');
    expect(migration).toContain('payment_order_id');
    expect(migration).toContain('client.connect()');
    expect(read('scripts/migrate-all.mjs')).toContain('health-checkup-bookings');
  });

  test('patient API exposes eligibility, availability, booking and payment operations', () => {
    const route = read('routes/health-checkup.route.js');
    for (const endpoint of ["'/me'", "'/packages'", "'/packages/:packageId'", "'/labs'", "'/slots'", "'/bookings'", "'/bookings/:bookingId/cancel'", "'/bookings/:bookingId/reschedule'", "'/bookings/:bookingId/payment'", "'/bookings/:bookingId/payment/verify'"]) {
      expect(route).toContain(endpoint);
    }
    expect(route).toContain('package_not_eligible');
    expect(route).toContain('slot_unavailable');
    expect(route).toContain('verifyRazorpaySignature');
    expect(route).toContain('notifyConfirmedBooking');
  });
});
