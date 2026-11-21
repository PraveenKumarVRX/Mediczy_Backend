import { readFileSync } from 'node:fs';
import { addDirectoryLabToNetworks } from '../services/provider-network-bookable.service.js';

// Team QA 2026-11-21 items 1-2: a lab added on the Provider Network page never became
// bookable, because Team booking searches only the labs in each company's network.

const entry = { id: '105', provider_type: 'lab', name: 'Likitha Diagnostics', address: 'D.No 13-1-3, Old Bank St, Guntur', city: 'Guntur', state: 'Andhra Pradesh', pincode: '522001', phone: '', email: '' };

function fakeDb({ directory = entry, companies = [{ id: 45, name: 'Dairy Day', status: 'Active' }], linked = [], sameName = [], assigned = new Set() } = {}) {
  const calls = [];
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (sql.includes('FROM smarthealth_provider_network WHERE id')) return { rows: directory ? [directory] : [] };
      if (sql.includes('FROM corporates WHERE id = ANY')) return { rows: companies.filter((c) => params[0].includes(c.id)) };
      if (sql.includes("WHERE metadata->>'providerNetworkId' = $1")) return { rows: linked };
      if (sql.includes('lower(trim(l.name)) = lower(trim($1))')) return { rows: sameName };
      if (sql.includes('SELECT 1 FROM labs WHERE lower(email)')) return { rows: [] };
      if (sql.includes('INSERT INTO labs')) return { rows: [{ id: 9001 }] };
      if (sql.includes('INSERT INTO corporate_network_assignments')) {
        const k = `${params[0]}:${params[1]}`;
        if (assigned.has(k)) return { rowCount: 0, rows: [] };
        assigned.add(k); return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => {},
  };
  return { db: { connect: async () => client, query: client.query }, calls };
}

describe('making a Provider Network lab bookable', () => {
  test('a lab not on the lab master is created without a usable login and assigned to the company', async () => {
    const { db, calls } = fakeDb();
    const out = await addDirectoryLabToNetworks({ providerId: '105', corporateIds: [45], actorUserId: 110 }, db);
    expect(out).toMatchObject({ labId: 9001, created: true, added: [{ corporateId: 45, name: 'Dairy Day' }], alreadyBookable: [] });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO labs'));
    expect(insert.sql).not.toContain('unique_id');
    expect(insert.params[1]).toBe('provider-network-105@no-login.mediqzy.invalid');
    expect(insert.params[2]).toMatch(/^\$2[aby]\$/); // a hash of random bytes nobody holds
    expect(JSON.parse(insert.params[5])).toMatchObject({ providerNetworkId: '105', noLogin: true });
    const assign = calls.find((c) => c.sql.includes('INSERT INTO corporate_network_assignments'));
    expect(assign.params).toEqual([45, 9001, 110]);
    expect(calls.at(-1).sql).toBe('COMMIT');
  });

  test('the same branch on the lab master is reused, matched by pincode', async () => {
    const { db, calls } = fakeDb({ sameName: [{ id: 117, pin: '500062' }, { id: 120, pin: '522001' }, { id: 116, pin: '500072' }] });
    const out = await addDirectoryLabToNetworks({ providerId: '105', corporateIds: [45], actorUserId: 110 }, db);
    expect(out).toMatchObject({ labId: 120, created: false, matchedBy: 'name_city_pincode' });
    expect(calls.some((c) => c.sql.includes('INSERT INTO labs'))).toBe(false);
  });

  test('a branch with a different pincode is never reused; an unclear match makes a new lab', async () => {
    let { db } = fakeDb({ sameName: [{ id: 117, pin: '500062' }] });
    expect(await addDirectoryLabToNetworks({ providerId: '105', corporateIds: [45], actorUserId: 110 }, db)).toMatchObject({ labId: 9001, created: true });
    ({ db } = fakeDb({ sameName: [{ id: 117, pin: null }, { id: 118, pin: null }] }));
    expect(await addDirectoryLabToNetworks({ providerId: '105', corporateIds: [45], actorUserId: 110 }, db)).toMatchObject({ labId: 9001, created: true });
    ({ db } = fakeDb({ sameName: [{ id: 117, pin: null }] }));
    expect(await addDirectoryLabToNetworks({ providerId: '105', corporateIds: [45], actorUserId: 110 }, db)).toMatchObject({ labId: 117, created: false, matchedBy: 'name_and_city' });
  });

  test('already bookable is reported, not duplicated', async () => {
    const { db } = fakeDb({ linked: [{ id: 120 }], assigned: new Set(['45:120']) });
    expect(await addDirectoryLabToNetworks({ providerId: '105', corporateIds: [45], actorUserId: 110 }, db))
      .toMatchObject({ labId: 120, added: [], alreadyBookable: [{ corporateId: 45 }] });
  });

  test('refuses what cannot be placed or is not a lab, inactive or unknown companies, and an empty choice', async () => {
    await expect(addDirectoryLabToNetworks({ providerId: '105', corporateIds: [], actorUserId: 110 }, fakeDb().db)).rejects.toMatchObject({ status: 400 });
    await expect(addDirectoryLabToNetworks({ providerId: '106', corporateIds: [45], actorUserId: 110 }, fakeDb({ directory: { ...entry, city: '' } }).db)).rejects.toMatchObject({ status: 409 });
    await expect(addDirectoryLabToNetworks({ providerId: '7', corporateIds: [45], actorUserId: 110 }, fakeDb({ directory: { ...entry, provider_type: 'hospital' } }).db)).rejects.toMatchObject({ status: 409 });
    await expect(addDirectoryLabToNetworks({ providerId: '105', corporateIds: [52], actorUserId: 110 }, fakeDb({ companies: [{ id: 52, name: 'Old', status: 'Inactive' }] }).db)).rejects.toMatchObject({ status: 409 });
    await expect(addDirectoryLabToNetworks({ providerId: '105', corporateIds: [99], actorUserId: 110 }, fakeDb().db)).rejects.toMatchObject({ status: 404 });
    await expect(addDirectoryLabToNetworks({ providerId: '1', corporateIds: [45], actorUserId: 110 }, fakeDb({ directory: null }).db)).rejects.toMatchObject({ status: 404 });
  });

  test('adding to a network needs the Corporate Management permission', () => {
    const src = readFileSync(new URL('../routes/provider-network-bot.route.js', import.meta.url), 'utf8');
    expect(src).toContain("router.post('/directory/:providerId/add-to-network', authTeam, requirePermission(['Corporate Management']),");
  });
});
