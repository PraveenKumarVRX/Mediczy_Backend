/**
 * Tripwire (WP-1.5): schema changes belong in migrations, not in route handlers. A route that runs CREATE/ALTER TABLE
 * does it on the request path, with whatever privileges the app role has, unversioned and un-reviewed.
 *
 * The files below still do (pre-existing — each should be moved to a migration). The list is PINNED: it may shrink, and a
 * NEW route file with DDL fails this test. roadmap-intelligence was removed from it when its DDL moved to
 * migrations/20260926000006-roadmap-intelligence.migration.js.
 *
 * 2026-11-12: shrunk from 29 to 13. Sixteen entries no longer contained DDL at all and had simply never been removed, so
 * this suite had been failing on its own bookkeeping; doctor-chat.route.js was a real new violation (it added
 * chat_messages.translated_content on the request path) and moved to
 * migrations/20261112000100-chat-message-translations.migration.js, with the route now probing information_schema
 * read-only. Removing a file from this list is the LAST step of moving its DDL to a migration, never a way to quiet the
 * test.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KNOWN = new Set([
  'routes/activityTracker.route.js',
  'routes/admin.route.js',
  'routes/ambulance/auth.routes.js',
  'routes/dept/biomedical.route.js',
  'routes/dept/bloodBank.route.js',
  'routes/dept/cssd.route.js',
  'routes/dept/dietary.route.js',
  'routes/hospital-auth.route.js',
  'routes/hrms.route.js',
  'routes/lab/auth.routes.js',
  'routes/org-membership-plans.route.js',
  'routes/payroll.route.js',
  'routes/qms.route.js',
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
