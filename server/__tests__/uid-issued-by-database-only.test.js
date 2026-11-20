/**
 * CLAUDE.md entity-UID rule 1: never mint an id in application code; the trg_entity_uid_*
 * triggers issue and register it. Ten places used to mint one (model hooks + admin routes).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === 'node_modules' || f === '__tests__' || f.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

test('no model, route, service or controller mints an entity uid', () => {
  const offenders = [];
  for (const dir of ['models', 'routes', 'services', 'controller']) {
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, 'utf8');
      if (/\bgenerateUniqueIdForModel\s*\(|\bgenerateGuaranteedUniqueId\s*\(|\.unique_id\s*=\s*await\s+generateUniqueId\s*\(/.test(src)) offenders.push(file.replace(root, ''));
    }
  }
  expect(offenders).toEqual([]);
});
