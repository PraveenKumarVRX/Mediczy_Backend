import express from 'express';
import crypto from 'node:crypto';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
const router = express.Router();
router.use(authUser, requireRole('admin'));
const select = `SELECT p.*, c."companyName" AS "corporateName",
  (SELECT COUNT(*)::int FROM user_health_packages u WHERE u."packageId"=p.id::text AND u.corporate_id=c.id AND LOWER(u.status)='active') AS enrolled
  FROM corporate_health_package_catalog p JOIN corporates c ON c.id::text=p.metadata->>'corporateId'
  WHERE p.metadata->>'kind'='health_checkup'`;
const view = p => ({ id: String(p.id), corporateId: String(p.metadata.corporateId), corporateName: p.corporateName,
    packageName: p.name, description: p.description || '', tests: p.features?.tests || [], frequency: p.metadata.frequency,
    validityPeriod: p.metadata.validityPeriod, costPerEmployee: Number(p.price), maxEmployees: Number(p.max_users || 0),
    currentEnrolled: p.enrolled || 0, status: p.metadata.status || (p.is_active ? 'Active' : 'Inactive'), createdAt: p.created_at });
const query = (sql, replacements = {}, transaction) => db.query(sql, { replacements, transaction, type: db.QueryTypes.SELECT });
const fail = (res, e) => { console.error('[admin-health-packages]', e); return res.status(500).json({ success: false, message: 'Unable to save or load health packages' }); };
router.get('/', async (req, res) => { try {
    return res.json({ success: true, data: (await query(`${select} ORDER BY p.created_at DESC`)).map(view) });
}
catch (e) {
    return fail(res, e);
} });
router.get('/:id', async (req, res) => { if (!/^[A-Za-z0-9_-]{1,150}$/.test(req.params.id))
    return res.status(404).json({ success: false, message: 'Package not found' }); try {
    const [p] = await query(`${select} AND p.id=:id`, req.params);
    return p ? res.json({ success: true, data: view(p) }) : res.status(404).json({ success: false, message: 'Package not found' });
}
catch (e) {
    return fail(res, e);
} });
async function save(req, res) {
    const b = req.body || {}, price = Number(b.costPerEmployee), capacity = Number(b.maxEmployees);
    if (!/^\d+$/.test(String(b.corporateId)) || !String(b.packageName || '').trim() || String(b.packageName).trim().length > 255 || !Array.isArray(b.tests) || !b.tests.length || b.tests.some(t => typeof t !== 'string' || !t.trim()) || !Number.isFinite(price) || price < 0 || !Number.isInteger(capacity) || capacity < 1 || !['Active', 'Inactive', 'Draft', 'Expired'].includes(b.status) || !['Annual', 'Bi-Annual', 'Quarterly', 'Monthly'].includes(b.frequency) || !['1 Year', '2 Years', '3 Years', 'Lifetime'].includes(b.validityPeriod))
        return res.status(400).json({ success: false, message: 'Provide a corporate, package name, tests, valid status, frequency, validity, nonnegative cost and positive employee capacity' });
    if (req.params.id && !/^[A-Za-z0-9_-]{1,150}$/.test(req.params.id))
        return res.status(404).json({ success: false, message: 'Package not found' });
    try {
        const [corporate] = await query('SELECT id FROM corporates WHERE id=:id', { id: b.corporateId });
        if (!corporate)
            return res.status(404).json({ success: false, message: 'Corporate not found' });
        const metadata = JSON.stringify({ kind: 'health_checkup', corporateId: String(corporate.id), frequency: b.frequency, validityPeriod: b.validityPeriod, status: b.status });
        const replacements = { id: req.params.id, corporateId: corporate.id, name: b.packageName.trim(), description: String(b.description || ''), price, capacity, active: b.status === 'Active', features: JSON.stringify({ tests: b.tests, price, description: String(b.description || '') }), metadata, slug: `hc-${crypto.randomUUID()}` };
        const result = await db.transaction(async (transaction) => {
            if (req.params.id) {
                const [old] = await query(`${select} AND p.id=:id FOR UPDATE OF p`, { id: req.params.id }, transaction);
                if (!old)
                    return null;
                if (String(old.metadata.corporateId) !== String(b.corporateId))
                    throw Object.assign(new Error('A package cannot be moved to another corporate'), { validation: true });
                if (old.enrolled > capacity)
                    throw Object.assign(new Error('Capacity cannot be less than current enrollment'), { validation: true });
                const [p] = await query(`UPDATE corporate_health_package_catalog SET name=:name,description=:description,price=:price,max_users=:capacity,is_active=:active,features=:features,metadata=:metadata,updated_at=NOW() WHERE id=:id RETURNING *`, replacements, transaction);
                await query(`UPDATE user_health_packages SET "packageName"=:name,"packageDetails"=:features,status=CASE WHEN :active THEN 'active' ELSE 'inactive' END,"updatedAt"=NOW() WHERE "packageId"=:id AND corporate_id=:corporateId RETURNING id`, { ...replacements, id: String(p.id), corporateId: corporate.id }, transaction);
                return p;
            }
            const [p] = await query(`INSERT INTO corporate_health_package_catalog (id,corporate_id,name,slug,type,description,price,max_users,is_active,features,metadata,created_at,updated_at) VALUES (:slug,:corporateId,:name,:slug,'CORPORATE',:description,:price,:capacity,:active,:features,:metadata,NOW(),NOW()) RETURNING *`, replacements, transaction);
            return p;
        });
        return result ? res.status(req.params.id ? 200 : 201).json({ success: true, data: view(result) }) : res.status(404).json({ success: false, message: 'Package not found' });
    }
    catch (e) {
        if (e.validation)
            return res.status(400).json({ success: false, message: e.message });
        return fail(res, e);
    }
}
router.post('/', save);
router.put('/:id', save);
router.delete('/:id', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(req.params.id)) return res.status(404).json({ success:false,message:'Package not found' });
    try {
        const deleted=await db.transaction(async transaction=>{
            const rows=await query(`UPDATE corporate_health_package_catalog SET is_active=false,metadata=metadata || '{"status":"Inactive"}'::jsonb,updated_at=NOW() WHERE id=:id AND metadata->>'kind'='health_checkup' RETURNING id`,req.params,transaction);
            if(!rows.length)return false;
            await query(`UPDATE user_health_packages SET status='inactive',"updatedAt"=NOW() WHERE "packageId"=:id RETURNING id`,req.params,transaction);
            return true;
        });
        return deleted?res.json({success:true}):res.status(404).json({success:false,message:'Package not found'});
    } catch(e) {return fail(res,e);}
});
router.post('/:id/tag-employees', async (req, res) => {
    const ids = req.body?.employeeIds;
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(req.params.id) || !Array.isArray(ids) || !ids.length || ids.some(id => !/^\d+$/.test(String(id))))
        return res.status(400).json({ success: false, message: 'Select linked employee accounts' });
    try {
        const result = await db.transaction(async (transaction) => {
            const [p] = await query(`${select} AND p.id=:id FOR UPDATE OF p`, req.params, transaction);
            if (!p || !p.is_active)
                throw Object.assign(new Error('Active package not found'), { status: 404 });
            const employees = await query(`SELECT DISTINCT ce."userId" FROM corporate_employees ce JOIN user_associations ua ON ua."userId"=ce."userId" AND ua."entityId"=ce.corporate_id AND ua."entityType"='corporate' AND ua.role='employee' AND ua.status='active' WHERE ce.corporate_id=:corporateId AND ce."isActive"=true AND ce."userId" IN (:ids)`, { corporateId: p.metadata.corporateId, ids }, transaction);
            if (employees.length !== new Set(ids.map(String)).size)
                throw Object.assign(new Error('All selected employees must be active linked members of this corporate'), { status: 400 });
            const [count] = await query(`SELECT COUNT(*)::int AS total FROM user_health_packages WHERE "packageId"=:id AND LOWER(status)='active' AND "userId" NOT IN (:ids)`, { id: String(p.id), ids }, transaction);
            if (count.total + employees.length > p.max_users)
                throw Object.assign(new Error('Package employee capacity exceeded'), { status: 409 });
            for (const employee of employees)
                await query(`INSERT INTO user_health_packages ("userId",corporate_id,"packageId","packageName","packageDetails","validFrom","validTo",status,"createdAt","updatedAt") VALUES (:userId,:corporateId,:packageId,:name,:details,CURRENT_DATE,CASE WHEN :years = 0 THEN NULL ELSE CURRENT_DATE+make_interval(years=>:years) END,'active',NOW(),NOW()) ON CONFLICT ("userId","packageId") DO UPDATE SET "packageName"=EXCLUDED."packageName","packageDetails"=EXCLUDED."packageDetails",status='active',"updatedAt"=NOW() RETURNING id`, { userId: employee.userId, corporateId: p.metadata.corporateId, packageId: String(p.id), name: p.name, details: JSON.stringify(p.features), years: p.metadata.validityPeriod === 'Lifetime' ? 0 : parseInt(p.metadata.validityPeriod) }, transaction);
            return employees.length;
        });
        return res.json({ success: true, data: { tagged: result } });
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ success: false, message: e.message });
        return fail(res, e);
    }
});
export default router;
