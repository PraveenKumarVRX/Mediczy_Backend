import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
let role = 'admin';
let permissions=['Corporate Management'];
const query = jest.fn();
const transaction = jest.fn(async (fn) => fn({}));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser: (req, res, next) => { req.user = { id: 1, role, metadata: {permissions} }; next(); }, requireRole: roles => (req, res, next) => roles.includes(role) ? next() : res.sendStatus(403) }));
// Models in this route's import graph call sequelize.define() and then register
// hooks on the result at module load, so the stub answers any method with a spy.
const stubObject = (seed = {}) => {
  const target = { ...seed };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      obj[prop] = jest.fn();
      return obj[prop];
    },
    has: () => true,
  });
};
const defineModel = () => stubObject({ rawAttributes: {}, associations: {}, prototype: {}, tableName: 'stub', name: 'Stub' });
const sequelizeStub = stubObject({
  query, transaction,
  QueryTypes: { SELECT: 'SELECT', UPDATE: 'UPDATE', INSERT: 'INSERT', DELETE: 'DELETE' },
  define: jest.fn(defineModel),
  model: jest.fn(defineModel),
  models: {},
  literal: jest.fn(v => v),
  fn: jest.fn((...args) => args),
  col: jest.fn(v => v),
  getQueryInterface: jest.fn(() => stubObject({ showAllTables: jest.fn(async () => []) })),
});
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: sequelizeStub, connectToPostgresDB: jest.fn(), default: sequelizeStub }));
const { default: router } = await import('../routes/admin-health-packages.route.js');
const app = express();
app.use(express.json());
app.use(router);
const body = { corporateId: '3', packageName: 'Screening', description: 'Screening', tests: ['CBC'], frequency: 'Annual', validityPeriod: '1 Year', costPerEmployee: 100, maxEmployees: 2, status: 'Active' };
const plan = { id: 20, name: 'Screening', metadata: { kind: 'health_checkup', corporateId: '3', frequency: 'Annual', validityPeriod: '1 Year', status: 'Active' }, features: { tests: ['CBC'] }, max_users: 2, price: 100, is_active: true };
beforeEach(() => { role = 'admin'; permissions=['Corporate Management']; query.mockReset(); transaction.mockClear(); });
test.each(['user', 'lab'])('rejects unauthorized role %s', async (r) => { role = r; expect((await request(app).get('/')).status).toBe(403); expect(query).not.toHaveBeenCalled(); });
test('returns an empty real catalog without demo packages', async () => { query.mockResolvedValueOnce([]); expect((await request(app).get('/')).body.data).toEqual([]); });
test.each([{ maxEmployees: 0 }, { costPerEmployee: -1 }, { tests: [] }, { corporateId: 'invalid' }, { status: 'arbitrary' }])('validates package fields %j', async (patch) => { expect((await request(app).post('/').send({ ...body, ...patch })).status).toBe(400); expect(query).not.toHaveBeenCalled(); });
test('creates a durable corporate catalog record without assigning arbitrary employees', async () => { query.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce([plan]); const r = await request(app).post('/').send(body); expect(r.status).toBe(201); expect(r.body.data).toMatchObject({ id: '20', corporateId: '3', currentEnrolled: 0 }); expect(query).toHaveBeenCalledTimes(2); expect(query.mock.calls[1][0]).toContain('INSERT INTO corporate_health_package_catalog'); });
test('unknown legacy demo ID returns 404', async () => { query.mockResolvedValueOnce([]); expect((await request(app).get('/pkg_001')).status).toBe(404); });
test('tagging rejects employees outside the corporate before writes', async () => { query.mockResolvedValueOnce([plan]).mockResolvedValueOnce([]); expect((await request(app).post('/20/tag-employees').send({ employeeIds: ['9'] })).status).toBe(400); expect(query).toHaveBeenCalledTimes(2); });
test('tagging enforces capacity inside the locked package transaction', async () => { query.mockResolvedValueOnce([plan]).mockResolvedValueOnce([{ userId: 9 }]).mockResolvedValueOnce([{ total: 2 }]); expect((await request(app).post('/20/tag-employees').send({ employeeIds: ['9'] })).status).toBe(409); expect(query).toHaveBeenCalledTimes(3); });
test('tagging writes the same employee entitlement consumed by booking', async () => { query.mockResolvedValueOnce([plan]).mockResolvedValueOnce([{ userId: 9 }]).mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([{ id: 1 }]); const r = await request(app).post('/20/tag-employees').send({ employeeIds: ['9'] }); expect(r.status).toBe(200); expect(r.body.data.tagged).toBe(1); expect(query.mock.calls[3][1].replacements).toMatchObject({ corporateId: '3', userId: 9, packageId: '20' }); });

test('allows Team with Corporate Management permission',async()=>{role='team';query.mockResolvedValueOnce([]);expect((await request(app).get('/')).status).toBe(200);});
test('rejects Team without Corporate Management permission',async()=>{role='team';permissions=[];expect((await request(app).get('/')).status).toBe(403);expect(query).not.toHaveBeenCalled();});
test.each([{eligibleRelations:[]},{eligibleRelations:['uncle']},{eligibleRelations:'self'}])('rejects invalid eligibility %j',async({eligibleRelations})=>{expect((await request(app).post('/').send({...body,eligibleRelations})).status).toBe(400);expect(query).not.toHaveBeenCalled();});
test('restricted venues cannot be empty',async()=>{expect((await request(app).post('/').send({...body,venueMode:'restricted',venues:[]})).status).toBe(400);});
test('rejects venue outside corporate network atomically',async()=>{query.mockResolvedValueOnce([{id:3}]).mockResolvedValueOnce([plan]).mockResolvedValueOnce([]);expect((await request(app).post('/').send({...body,venueMode:'restricted',venues:[{partnerId:9,partnerType:'hospital',relation:'all'}]})).status).toBe(400);expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO health_package_venues'))).toBe(false);});
