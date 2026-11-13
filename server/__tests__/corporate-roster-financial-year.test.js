import fs from 'fs';
import { fiscalYearOf } from '../utils/ist-date.js';

const route = fs.readFileSync('routes/corporate.route.js', 'utf8');
const script = fs.readFileSync('scripts/reconcile-corporate-roster.mjs', 'utf8');
const migration = fs.readFileSync('migrations/20261113000100-corporate-roster-financial-year.migration.js', 'utf8');

describe('the financial year is the roster\'s unit', () => {
  it('uses the finance ledger\'s own FY definition, not a second one', () => {
    // 1 April – 31 March, computed in IST. A separate implementation would
    // drift from the ledger at the year boundary.
    expect(fiscalYearOf('2026-04-01').label).toBe('FY2026-27');
    expect(fiscalYearOf('2027-03-31').label).toBe('FY2026-27');
    expect(fiscalYearOf('2027-04-01').label).toBe('FY2027-28');
    expect(fiscalYearOf('2026-03-31').label).toBe('FY2025-26');
    expect(route).toContain("import { fiscalYearOf } from '../utils/ist-date.js'");
    expect(script).toContain("import { fiscalYearOf } from '../utils/ist-date.js'");
  });

  it('stamps the year on every roster row the upload touches', () => {
    expect(route).toContain('roster_financial_year, roster_uploaded_at');
    expect(route).toContain('rosterFinancialYear: fiscalYearOf().label');
    // both the bulk and the single-employee insert
    expect(route.match(/rosterFinancialYear: fiscalYearOf\(\)\.label/g)).toHaveLength(2);
  });

  it('refreshes an existing staff code instead of rejecting it', () => {
    // Next April's file carries most of the same codes; rejecting them would
    // reject nearly every row.
    expect(route).toContain('UPDATE corporate_employees SET');
    expect(route).toContain('roster_financial_year = :rosterFinancialYear');
    expect(route).toContain('"exitDate" = NULL');
    expect(route).toContain('refreshed: true');
  });

  it('still rejects one address arriving under a different staff code', () => {
    expect(route).toContain("already belongs to ${existingByEmail.employeeId}");
    expect(route).toContain('.toLowerCase() !== generatedEmployeeId.toLowerCase()');
  });

  it('closing out a year never deletes anyone or touches their account', () => {
    expect(script).toContain('"isActive"=false');
    expect(script).toContain("status='inactive'");
    expect(script).not.toMatch(/DELETE FROM corporate_employees|DELETE FROM users/);
    expect(script).toContain('left untouched');
  });

  it('refuses to close out a year that has no upload', () => {
    // Otherwise every active employee would be marked as having left.
    expect(script).toContain('No roster rows are stamped');
    expect(script).toContain('before closing the year out');
  });

  it('is report-only unless --apply', () => {
    expect(script).toContain("process.argv.includes('--apply')");
    expect(script).toContain('DRY RUN');
  });

  it('reports leavers who still hold a live entitlement', () => {
    // A leaver can be mid-checkup; that needs a human decision, not a sweep.
    expect(script).toContain('live_entitlements');
    expect(script).toContain('may still be mid-checkup');
  });

  it('survives a server reloaded before the migration is applied', () => {
    // The code deploys before its migration. An INSERT naming a column that
    // does not exist yet would hard-fail 42703 and break employee upload
    // entirely for everyone, not just the roster stamp.
    expect(route).toContain('rosterFinancialYearAvailable()');
    expect(route).toMatch(/\$\{rosterYearReady \? ', roster_financial_year, roster_uploaded_at' : ''\}/);
    expect(route).toMatch(/\$\{rosterYearReady \? ', :rosterFinancialYear, NOW\(\)' : ''\}/);
    const identity = fs.readFileSync('services/corporate-employee-identity.service.js', 'utf8');
    // and only a positive answer may be cached, or the process stays degraded
    // until someone restarts it
    expect(identity).toContain('if (rosterYearColumn === true) return true;');
  });

  it('the migration is additive and registered', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS roster_financial_year');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS roster_uploaded_at');
    expect(migration).toContain('idx_corporate_employees_roster_fy');
    expect(fs.readFileSync('scripts/migrate-all.mjs', 'utf8'))
      .toContain('20261113000100-corporate-roster-financial-year.migration.js');
  });
});
