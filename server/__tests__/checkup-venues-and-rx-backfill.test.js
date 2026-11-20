import { readFileSync } from 'node:fs';
import { VENUE_HAS_SLOTS } from '../services/health-checkup-venues.js';

describe('only venues with time slots are offered for a check-up', () => {
  const route = readFileSync(new URL('../routes/health-checkup.route.js', import.meta.url), 'utf8');

  test('the condition reads the same slot keys as slots(), in the same order, and needs at least one', () => {
    expect(VENUE_HAS_SLOTS).toContain("COALESCE(l.metadata->'healthCheckupSlots', l.metadata->'health_checkup_slots',\n  l.metadata->'pickupSlots', l.metadata->'pickup_slots')");
    expect(VENUE_HAS_SLOTS).toContain("= 'array'");
    expect(VENUE_HAS_SLOTS).toContain('jsonb_array_length');
    expect(route).toContain('obj(lab?.metadata).healthCheckupSlots || obj(lab?.metadata).health_checkup_slots || obj(lab?.metadata).pickupSlots || obj(lab?.metadata).pickup_slots');
  });

  test('both the venue list and the venue lookup used by slots and booking apply it', () => {
    expect(route.match(/LOWER\(COALESCE\(l\.status,'active'\)\)='active' AND \$\{VENUE_HAS_SLOTS\}/g)).toHaveLength(2);
    expect(route).toMatch(/async function labFor\([^\n]*\$\{VENUE_HAS_SLOTS\}/);
    expect(route).toMatch(/router\.get\('\/labs'[^\n]*\$\{VENUE_HAS_SLOTS\}/);
  });
});

describe('medicine schedule backfill', () => {
  const script = readFileSync(new URL('../scripts/backfill-medicine-schedules.mjs', import.meta.url), 'utf8');

  test('only blank schedules are filled, and never from an ingredient also sold OTC', () => {
    expect(script).toContain("WHERE p.sch = ''");
    expect(script).toContain("AND COALESCE(trim(m.schedule), '') = ''");
    expect(script).toContain('ing NOT IN (SELECT ing FROM otc)');
    expect(script).toContain("WHERE n = 1 AND sch IN ('H', 'H1', 'X')");
  });

  test('the strictest schedule wins and every change is backed up before the update', () => {
    expect(script).toContain("(ARRAY['H', 'H1', 'X'])[max(rx.rank)]");
    expect(script.lastIndexOf('INSERT INTO backup_medicine_schedule_backfill')).toBeLessThan(script.lastIndexOf('UPDATE pharmacy_medicines m SET schedule'));
    expect(script).toContain('rolled back');
  });

  test('dry run is the default; writing needs --apply', () => {
    expect(script).toContain("const APPLY = process.argv.includes('--apply')");
    expect(script).toContain('if (!APPLY && !REHEARSE) { await tx.rollback();');
  });
});
