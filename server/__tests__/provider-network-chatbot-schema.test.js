import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('provider network and chatbot schema ownership', () => {
  it('keeps provider and chatbot DDL in the migration chain', () => {
    for (const file of ['routes/provider-network-bot.route.js', 'routes/sib-chatbots.route.js']) {
      const route = read(file);
      expect(route).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
      expect(route).toContain('SCHEMA_NOT_MIGRATED');
    }
    const migration = read('migrations/20261015004100-provider-network-chatbot-governance.migration.js');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(5);
    expect(migration).toContain('DROP TABLE IF EXISTS provider_network_batches CASCADE');
  });
});
