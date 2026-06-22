/** GAP-MIG-003 / GAP-IPD-005 — ER workflow tests */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('er-workflow', () => {
  it('route file exists', () => {
    const fp = path.join(__dirname, '../routes/er-workflow.route.js');
    expect(fs.existsSync(fp)).toBe(true);
  });

  it('er_visits migration exists', () => {
    const fp = path.join(__dirname, '../migrations/20260617000001-create-er-visits.js');
    expect(fs.existsSync(fp)).toBe(true);
  });
});
