import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * The corporate network is what every annual-health-checkup venue list is
 * built from, so removing a lab withdraws it from employee booking. Before
 * this endpoint the network could only be added to.
 */
describe('corporate network removal', () => {
  const source = read('routes/admin.route.js');
  const handler = source.slice(
    source.indexOf("router.delete('/corporate-network-assignments'"),
    source.indexOf('Assign Health Package to Corporate Employees')
  );

  it('exposes the endpoint to team as well as admin', () => {
    expect(handler.length).toBeGreaterThan(500);
    expect(handler).toContain("requireRole(['admin', 'team'])");
  });

  it('matches a partner on BOTH type and id, never id alone', () => {
    // Lab 58 and hospital 58 are different partners; deleting by id alone
    // would take the wrong row out of the network.
    const pairMatches = handler.match(/\(partner_type, partner_id\) IN \(/g) || [];
    expect(pairMatches.length).toBe(2); // the pre-read and the delete
    expect(handler).not.toMatch(/WHERE corporate_id = :corporateId\s*AND partner_id IN/);
  });

  it('scopes every statement to the corporate being edited', () => {
    const statements = handler.match(/FROM corporate_network_assignments|DELETE FROM corporate_network_assignments/g) || [];
    expect(statements.length).toBeGreaterThanOrEqual(2);
    // Neither the read nor the delete may run unscoped.
    expect(handler).not.toMatch(/DELETE FROM corporate_network_assignments\s*`/);
    expect((handler.match(/corporate_id = :corporateId/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('parameterises the pairs rather than interpolating them', () => {
    expect(handler).toContain('unnest(CAST(:types AS text[]), CAST(:ids AS int[]))');
    expect(handler).not.toMatch(/\$\{partners/);
  });

  it('validates partner type against a whitelist', () => {
    expect(handler).toContain("const validTypes = ['lab', 'hospital', 'clinic']");
    expect(handler).toContain('partnerType must be lab, hospital or clinic');
  });

  it('refuses a venue that still has live bookings unless forced', () => {
    expect(handler).toContain('partner_has_active_bookings');
    expect(handler).toContain('status(409)');
    expect(handler).toContain('labIds.length && !force');
    // Finished and cancelled bookings must not block a removal.
    expect(handler).toMatch(/NOT IN \('cancelled', 'completed', 'reports_available'\)/);
  });

  it('records what was removed so the change is recoverable', () => {
    expect(handler).toContain("action: 'remove_partners'");
    expect(handler).toContain('removed: removing');
  });

  it('reports when nothing matched instead of claiming success', () => {
    expect(handler).toContain('status(404)');
    expect(handler).toContain('None of those partners are assigned');
  });
});
