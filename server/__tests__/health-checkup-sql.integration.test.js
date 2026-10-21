import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const enabled = process.env.HEALTH_CHECKUP_SQL_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
suite('health package APIs against PostgreSQL (rolled back)', () => {
    let db, tx, app, corporateId, userId, packageId;
    beforeAll(async () => {
        ({ postgresSequelize: db } = await import('../db/postgres-sequelize.js'));
        tx = await db.transaction();
        const { up } = await import('../migrations/20261021009000-corporate-health-package-catalog.migration.js');
        await up({ query: sql => db.query(sql, { transaction: tx }) });
        const [employee] = await db.query(`SELECT ce.corporate_id,ce."userId" FROM corporate_employees ce JOIN user_associations ua ON ua."userId"=ce."userId" AND ua."entityId"=ce.corporate_id AND ua."entityType"='corporate' AND ua.role='employee' AND ua.status='active' WHERE ce."isActive"=true LIMIT 1`, { transaction: tx, type: db.QueryTypes.SELECT });
        if (!employee)
            throw new Error('Requires an existing active linked corporate employee');
        corporateId = employee.corporate_id;
        userId = employee.userId;
        jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser: (req, res, next) => { req.user = { id: userId, role: 'admin' }; next(); }, requireRole: () => (req, res, next) => next() }));
        jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { QueryTypes: db.QueryTypes, query: (sql, options) => db.query(sql, { ...options, transaction: tx }), transaction: async (fn) => fn(tx) } }));
        jest.unstable_mockModule('../middleware/authLab.middleware.js',()=>({authLab:(req,res,next)=>{req.lab={id:2147483647};next();}}));
        const {default:kitsRouter}=await import('../routes/health-package-kits.route.js');
        const { default: router } = await import('../routes/admin-health-packages.route.js');
        app = express();
        app.use(express.json());
        app.use('/kits',kitsRouter);
        app.use(router);
    });
    afterAll(async () => { if (tx)
        await tx.rollback(); if (db)
        await db.close(); });
    test('creates, loads, assigns, updates and deactivates a real catalog package', async () => {
        const payload = { corporateId: String(corporateId), packageName: 'Rollback QA Screening', description: 'Transient SQL validation', tests: ['CBC'], frequency: 'Annual', validityPeriod: '1 Year', costPerEmployee: 100, maxEmployees: 2, status: 'Active' };
        const created = await request(app).post('/').send(payload);
        expect(created.status).toBe(201);
        packageId = created.body.data.id;
        expect((await request(app).get(`/${packageId}`)).status).toBe(200);
        const kit=await request(app).get(`/kits/${packageId}`);
        expect(kit.status).toBe(200);expect(kit.body.kit.id).toBe(packageId);
        const jwt=(await import('jsonwebtoken')).default;
        const labToken=jwt.sign({role:'lab',id:2147483647},'test-only-secret');
        expect((await request(app).get(`/kits/${packageId}`).set('Authorization',`Bearer ${labToken}`)).status).toBe(404);
        const tagged = await request(app).post(`/${packageId}/tag-employees`).send({ employeeIds: [String(userId)] });
        expect(tagged.status).toBe(200);
        const detail = await request(app).get(`/${packageId}`);
        expect(detail.body.data.currentEnrolled).toBe(1);
        expect((await request(app).put(`/${packageId}`).send({ ...payload, packageName: 'Rollback QA Updated' })).status).toBe(200);
        const [entitlement] = await db.query('SELECT "packageName",status FROM user_health_packages WHERE "userId"=:userId AND "packageId"=:packageId', { replacements: { userId, packageId }, transaction: tx, type: db.QueryTypes.SELECT });
        expect(entitlement.packageName).toBe('Rollback QA Updated');
        expect((await request(app).delete(`/${packageId}`)).status).toBe(200);
    });
    test('activation assigns entitlements, invites employees, and rejects duplicate activation', async () => {
        const payload = { corporateId: String(corporateId), packageName: 'Rollback QA AHC', description: 'Transient activation validation', tests: ['CBC'], frequency: 'Annual', validityPeriod: '1 Year', costPerEmployee: 0, maxEmployees: 5, status: 'Active' };
        const created = await request(app).post('/').send(payload);
        expect(created.status).toBe(201);
        const [batch] = await db.query(`INSERT INTO corporate_ahc_batches (corporate_id,batch_name,due_date) VALUES (:corporateId,'Rollback QA',CURRENT_DATE+30) RETURNING id`, { replacements: { corporateId }, transaction: tx, type: db.QueryTypes.SELECT });
        await db.query(`INSERT INTO corporate_ahc_enrollments (batch_id,corporate_id,employee_id,user_id) SELECT :batchId,corporate_id,"employeeId","userId" FROM corporate_employees WHERE corporate_id=:corporateId AND "userId"=:userId LIMIT 1`, { replacements: { batchId: batch.id, corporateId, userId }, transaction: tx });
        const { activateAhcBatch } = await import('../services/ahc-activation.service.js');
        const result = await activateAhcBatch({ corporateId, batchId: batch.id, packageId: created.body.data.id });
        expect(result.invited).toBe(1);
        const [enrollment] = await db.query('SELECT status FROM corporate_ahc_enrollments WHERE batch_id=:id', { replacements: { id: batch.id }, transaction: tx, type: db.QueryTypes.SELECT });
        expect(enrollment.status).toBe('invited');
        const {remindAhcBatch}=await import('../services/ahc-activation.service.js');
        await db.query(`INSERT INTO corporate_ahc_enrollments (batch_id,corporate_id,employee_id) VALUES (:batchId,:corporateId,'ROLLBACK-UNLINKED')`,{replacements:{batchId:batch.id,corporateId},transaction:tx});
        expect(await remindAhcBatch({corporateId,batchId:batch.id})).toBe(1);
        expect(await remindAhcBatch({corporateId,batchId:0})).toBeNull();
        await expect(activateAhcBatch({ corporateId, batchId: batch.id, packageId: created.body.data.id })).rejects.toMatchObject({ status: 409 });
    });
    test('lab search accepts empty search without leaving a named parameter in SQL', async () => {
        const rows = await db.query(`SELECT l.id FROM labs l WHERE LOWER(COALESCE(l.status,'active'))='active' AND (:search = '' OR LOWER(l.name) LIKE LOWER(:likeSearch)) LIMIT 1`, { replacements: { search: '', likeSearch: '%%' }, transaction: tx, type: db.QueryTypes.SELECT });
        expect(Array.isArray(rows)).toBe(true);
    });
});
