import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('insurance fixes found in the 2026-11-21 review', () => {
  test('GET /api/insurance/claims reads insurance_claims as the member (FORCED RLS; it always returned [])', () => {
    const src = read('routes/insurance.route.js');
    const handler = src.slice(src.indexOf("router.get('/claims'"), src.indexOf("router.get('/claims'") + 1500);
    expect(handler).toContain('withRlsTransaction(pool, { userId: req.user.id }');
    expect(handler).not.toMatch(/await pool\.query\(\s*`SELECT c\.\*/);
  });

  test('the membership e-card never invents a card number', () => {
    const src = read('services/member-ecard.service.js');
    expect(src).not.toMatch(/cardNumber:\s*`POL-/);
    expect(src).toContain('cardNumber: row.cardNumber || null');
    expect(src).toContain('m."memberCardNumber"      AS "cardNumber"');
  });

  test('the MD India connector has no credentials in source and refuses without them', async () => {
    const src = read('services/mdindia-tpa.service.js');
    expect(src).not.toMatch(/MDINDIA_TPA_PASSWORD \|\| '/);
    expect(src).not.toMatch(/MDINDIA_TPA_USERNAME \|\| '/);
    const saved = { u: process.env.MDINDIA_TPA_USERNAME, p: process.env.MDINDIA_TPA_PASSWORD };
    delete process.env.MDINDIA_TPA_USERNAME;
    delete process.env.MDINDIA_TPA_PASSWORD;
    try {
      const mod = await import('../services/mdindia-tpa.service.js');
      const tpa = mod.default && typeof mod.default === 'object' ? mod.default : new (mod.default || mod.MDIndiaTPA)();
      expect(() => tpa.password).toThrow('not configured');
      expect(() => tpa.username).toThrow('not configured');
    } finally {
      if (saved.u !== undefined) process.env.MDINDIA_TPA_USERNAME = saved.u;
      if (saved.p !== undefined) process.env.MDINDIA_TPA_PASSWORD = saved.p;
    }
  });
});
