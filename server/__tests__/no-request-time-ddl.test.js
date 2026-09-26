/**
 * Tripwire (WP-1.5): schema changes belong in migrations, not in route handlers. A route that runs CREATE/ALTER TABLE
 * does it on the request path, with whatever privileges the app role has, unversioned and un-reviewed.
 *
 * The files below still do (pre-existing — each should be moved to a migration). The list is PINNED: it may shrink, and a
 * NEW route file with DDL fails this test. roadmap-intelligence was removed from it when its DDL moved to
 * migrations/20260926000006-roadmap-intelligence.migration.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KNOWN = new Set([
  'routes/activityTracker.route.js',
  'routes/admin.route.js',
  'routes/ai-governance.route.js',
  'routes/ai.js',
  'routes/ambulance/auth.routes.js',
  'routes/crm-ai.route.js',
  'routes/crm-analysis.route.js',
  'routes/crm-underwriting.route.js',
  'routes/crm.route.js',
  'routes/crmCampaigns.route.js',
  'routes/crmEmail.route.js',
  'routes/dept/biomedical.route.js',
  'routes/dept/bloodBank.route.js',
  'routes/dept/cssd.route.js',
  'routes/dept/dietary.route.js',
  'routes/hospital-auth.route.js',
  'routes/hospital-display.route.js',
  'routes/hospital/practice.route.js',
  'routes/hrms.route.js',
  'routes/hypergrid-connector.route.js',
  'routes/lab/auth.routes.js',
  'routes/lab/ris-imaging.route.js',
  'routes/org-membership-plans.route.js',
  'routes/payroll.route.js',
  'routes/provider-network-bot.route.js',
  'routes/qms.route.js',
  'routes/rwe-platform.route.js',
  'routes/sib-chatbots.route.js',
  'routes/team.route.js',
]);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
const withDdl = walk(path.join(root, 'routes'))
  .filter((f) => /CREATE\s+TABLE|ALTER\s+TABLE/i.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(root, f).split(path.sep).join('/'))
  .sort();

describe('no request-time DDL in routes', () => {
  it('no NEW route file runs CREATE/ALTER TABLE', () => {
    expect(withDdl.filter((f) => !KNOWN.has(f))).toEqual([]);
  });
  it('a file that no longer has DDL is removed from the known list (the list only shrinks)', () => {
    expect([...KNOWN].filter((f) => !withDdl.includes(f))).toEqual([]);
  });
  it('roadmap-intelligence is clean and its schema is the migration\'s', () => {
    expect(withDdl).not.toContain('routes/roadmap-intelligence.route.js');
    expect(fs.existsSync(path.join(root, 'migrations/20260926000006-roadmap-intelligence.migration.js'))).toBe(true);
  });
});
