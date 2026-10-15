import fs from 'node:fs';
import path from 'node:path';

describe('pharmacy inventory must not fabricate stock', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'routes/pharmacy/inventory.routes.js'), 'utf8');

  test('does not randomize stock, expiry, identifiers, or locations', () => {
    expect(source).not.toMatch(/Math\.random/);
  });

  test('catalogue fallback is explicitly non-stock', () => {
    expect(source).toContain("status: 'Catalog only'");
    expect(source).toContain("inStock: false");
    expect(source).toContain("INVENTORY_SCHEMA_NOT_READY");
  });
});
