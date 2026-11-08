process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';
import {
  consultationCapabilitySql,
  normalizeConsultationType,
  ONLINE_CAPABILITY_SQL,
  ONLINE_PRESENCE_SQL,
  WALKIN_CAPABILITY_SQL,
  HOMEVISIT_CAPABILITY_SQL,
} from '../utils/doctorConsultationCapability.js';

const HAS_ADDRESS = `("clinicAddress" IS NOT NULL)`;

describe('doctor consultation-type capability predicates (F-1)', () => {
  it('normalizes every spelling the routes accept', () => {
    for (const v of ['online', 'Online', 'ONLINE', 'tele', 'teleconsult', 'video']) {
      expect(normalizeConsultationType(v)).toBe('online');
    }
    for (const v of ['walkIn', 'walkin', 'walk-in', 'walk_in', 'inPerson', 'in-person', 'offline', 'clinic']) {
      expect(normalizeConsultationType(v)).toBe('walkIn');
    }
    for (const v of ['homeVisit', 'homevisit', 'home-visit', 'home_visit', 'home']) {
      expect(normalizeConsultationType(v)).toBe('homeVisit');
    }
  });

  it('returns null for unrecognised or absent input, so no filter is applied', () => {
    for (const v of [undefined, null, '', '   ', 'telepathy', 'walking', 'online ish']) {
      expect(normalizeConsultationType(v)).toBeNull();
      expect(consultationCapabilitySql(v, { hasAddressSql: HAS_ADDRESS })).toBeNull();
    }
  });

  // The actual regression this file exists to prevent.
  it('NEVER filters online consults on isOnline — that column is presence, not capability', () => {
    const sql = consultationCapabilitySql('online');
    expect(sql).toBe(ONLINE_CAPABILITY_SQL);
    expect(sql).not.toContain('isOnline');
    expect(sql).toContain(`'online'`);
    expect(sql).toContain('available');
  });

  it('keeps presence available separately, and it is still the isOnline column', () => {
    expect(ONLINE_PRESENCE_SQL).toContain('isOnline');
    expect(ONLINE_CAPABILITY_SQL).not.toBe(ONLINE_PRESENCE_SQL);
  });

  it('requires a usable address for walk-in, but never a Google-verified location', () => {
    const sql = consultationCapabilitySql('walkIn', { hasAddressSql: HAS_ADDRESS });
    expect(sql).toContain(WALKIN_CAPABILITY_SQL);
    expect(sql).toContain(HAS_ADDRESS);
    expect(sql).toMatch(/AND/);
    // googleVerifiedLocation matched 0 of 1104 rows and zeroed in-person search.
    expect(sql).not.toMatch(/placeId|place_id|google/i);
  });

  it('falls back to bare walk-in capability when no address fragment is supplied', () => {
    expect(consultationCapabilitySql('walkIn')).toBe(WALKIN_CAPABILITY_SQL);
  });

  it('matches home visits on their own key, never on the walk-in key', () => {
    const sql = consultationCapabilitySql('homeVisit', { hasAddressSql: HAS_ADDRESS });
    expect(sql).toBe(HOMEVISIT_CAPABILITY_SQL);
    expect(sql).toContain(`'homeVisit'`);
    expect(sql).not.toContain(`'walkIn'`);
  });

  it('compares jsonb instead of casting, so a non-boolean value cannot raise at query time', () => {
    for (const sql of [ONLINE_CAPABILITY_SQL, WALKIN_CAPABILITY_SQL, HOMEVISIT_CAPABILITY_SQL]) {
      expect(sql).toContain(`'true'::jsonb`);
      expect(sql).not.toContain('::boolean');
    }
  });

  it('quotes the camelCase column so Postgres does not fold it to lowercase', () => {
    for (const sql of [ONLINE_CAPABILITY_SQL, WALKIN_CAPABILITY_SQL, HOMEVISIT_CAPABILITY_SQL]) {
      expect(sql).toContain('"consultationTypes"');
    }
  });
});
