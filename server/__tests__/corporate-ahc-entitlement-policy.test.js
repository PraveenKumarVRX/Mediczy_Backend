import { ahcExtension, ahcWindow } from '../services/corporate-ahc-entitlement-policy.service.js';

describe('corporate AHC entitlement policy', () => {
  test('caps a 45-day entitlement at the FY corporate end date', () => {
    expect(ahcWindow({ assignedOn: '2027-02-20', validityPeriod: '45 Days', corporateValidFrom: '2026-11-01', corporateValidTo: '2027-03-31' }))
      .toMatchObject({ validFrom: '2027-02-20', validTo: '2027-03-31' });
  });
  test('caps the single extension at the corporate end date', () => {
    expect(ahcExtension({ currentValidTo: '2027-03-25', corporateValidTo: '2027-03-31', extensionDays: 15 }))
      .toMatchObject({ newValidTo: '2027-03-31', grantedDays: 6 });
  });
});
