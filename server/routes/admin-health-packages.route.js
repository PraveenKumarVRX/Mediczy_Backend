import express from 'express';
import { updatePackageEmployeeAssignments } from '../services/health-package-employee-assignments.service.js';
import { HEALTH_CHECKUP_VENUES_SQL } from '../services/health-checkup-venues.js';
import { eligibleRelations, validRelations, BENEFICIARY_RELATIONS, isValidValidityPeriod, validityPeriodToInterval } from '../services/health-package-policy.js';
import crypto from 'node:crypto';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { ahcExtension, ahcWindow, validityDays } from '../services/corporate-ahc-entitlement-policy.service.js';
import { notifyAhcEntitlement } from '../services/corporate-ahc-entitlement-notification.service.js';
import { invitationStatus, dispatchInvitations, MAX_PER_DISPATCH } from '../services/ahc-invitation-dispatch.service.js';
const router = express.Router();
router.use(authUser, requireRole(['admin', 'team']), (req, res, next) => {
    if (req.user?.isAdmin || ['admin','system_admin','super_admin'].includes(req.userRole || req.user?.role)) return next();
    let metadata = req.user?.metadata || {};
    if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { metadata = {}; } }
    const permissions = [...(Array.isArray(metadata.permissions) ? metadata.permissions : []), ...(Array.isArray(req.user?.permissions) ? req.user.permissions : [])];
    if (metadata.accessLevel === 'full' || permissions.some(p => ['corporate management','corporate management access','all access'].includes(String(p).trim().toLowerCase()))) return next();
    return res.status(403).json({success:false,message:'Corporate Management permission required'});
});
const select = `SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('partnerId',v.partner_id,'partnerType',v.partner_type,'relation',v.relation)) FROM health_package_venues v WHERE v.package_id=p.id),'[]'::jsonb) AS venues, c."companyName" AS "corporateName",
  (SELECT COUNT(*)::int FROM user_health_packages u WHERE u."packageId"=p.id::text AND u.corporate_id=c.id AND LOWER(u.status)='active') AS enrolled
  FROM corporate_health_package_catalog p JOIN corporates c ON c.id::text=p.metadata->>'corporateId'
  WHERE p.metadata->>'kind'='health_checkup'`;
const view = p => ({ id: String(p.id), corporateId: String(p.metadata.corporateId), corporateName: p.corporateName,
    eligibleRelations: eligibleRelations(p.metadata), venues: p.venues || [], venueMode: p.metadata.venueMode || 'inherit', packageName: p.name, description: p.description || '', tests: p.features?.tests || [], frequency: p.metadata.frequency,
    validityPeriod: p.metadata.validityPeriod, corporateValidFrom: p.metadata.corporateValidFrom || null, corporateValidTo: p.metadata.corporateValidTo || null, maxExtensionDays: Number(p.metadata.maxExtensionDays || 0), costPerEmployee: Number(p.price), maxEmployees: Number(p.max_users || 0),
    currentEnrolled: p.enrolled || 0, status: p.metadata.status || (p.is_active ? 'Active' : 'Inactive'), createdAt: p.created_at });
const query = (sql, replacements = {}, transaction) => db.query(sql, { replacements, transaction, type: db.QueryTypes.SELECT });
const fail = (res, e) => { console.error('[admin-health-packages]', e); return res.status(500).json({ success: false, message: 'Unable to save or load health packages' }); };
router.get('/', async (req, res) => { try {
    return res.json({ success: true, data: (await query(`${select} ORDER BY p.created_at DESC`)).map(view) });
}
catch (e) {
    return fail(res, e);
} });
router.get('/corporates/:corporateId/venues', async (req,res) => {
    if (!/^\d+$/.test(req.params.corporateId)) return res.status(400).json({success:false,message:'Invalid corporate'});
    try { const venues = await query(`SELECT l.partner_id AS "partnerId", l.partner_type AS "partnerType", l.name FROM ${HEALTH_CHECKUP_VENUES_SQL} l JOIN corporate_network_assignments n ON n.partner_id=l.partner_id AND n.partner_type=l.partner_type WHERE n.corporate_id=:corporateId AND LOWER(COALESCE(l.status,'active'))='active' ORDER BY l.name`,req.params); return res.json({success:true,data:venues}); } catch(e) {return fail(res,e);}
});
router.get('/:id/employee-options', async (req,res) => {
    if(!/^[A-Za-z0-9_-]{1,150}$/.test(req.params.id))return res.status(404).json({success:false,message:'Package not found'});
    try {
        const [p]=await query(`SELECT corporate_id FROM corporate_health_package_catalog WHERE id=:id AND metadata->>'kind'='health_checkup'`,req.params);
        if(!p)return res.status(404).json({success:false,message:'Package not found'});
        const employees=await query(`SELECT u.id,concat_ws(' ',u."firstName",u."lastName") AS name,COALESCE(u.email,'') AS email,
          COALESCE(ce."employeeId",u.employee_id,a.metadata->>'employeeId',u.metadata->>'employeeId','') AS "employeeId",
          COALESCE(NULLIF(ce.department,''),NULLIF(u.department_name,''),a.metadata->>'department',u.metadata->>'department','') AS department,
          COALESCE(NULLIF(ce.designation,''),ce.metadata->>'designation',a.metadata->>'designation',u.metadata->>'designation','') AS designation,
          EXISTS (SELECT 1 FROM user_health_packages h WHERE h."userId"=u.id AND h.corporate_id=:corporateId AND h."packageId"=:id AND LOWER(h.status)='active') AS assigned,
          (EXISTS (SELECT 1 FROM user_associations a WHERE a."userId"=u.id AND a."entityId"=:corporateId AND a."entityType"='corporate' AND a.role='employee' AND a.status='active')
            AND (ce.id IS NULL OR ce."isActive"=true)) AS "canAssign"
          FROM users u LEFT JOIN LATERAL (SELECT ce.* FROM corporate_employees ce WHERE ce."userId"=u.id AND ce.corporate_id=:corporateId ORDER BY ce.id DESC LIMIT 1) ce ON true
          LEFT JOIN LATERAL (SELECT a.metadata FROM user_associations a WHERE a."userId"=u.id AND a."entityId"=:corporateId AND a."entityType"='corporate' AND a.role='employee' AND a.status='active' ORDER BY a."createdAt" DESC LIMIT 1) a ON true
          WHERE EXISTS (SELECT 1 FROM user_associations a WHERE a."userId"=u.id AND a."entityId"=:corporateId AND a."entityType"='corporate' AND a.role='employee' AND a.status='active')
             OR EXISTS (SELECT 1 FROM user_health_packages h WHERE h."userId"=u.id AND h.corporate_id=:corporateId AND h."packageId"=:id AND LOWER(h.status)='active')
          ORDER BY u."firstName",u."lastName",u.id`,{id:req.params.id,corporateId:p.corporate_id});
        return res.json({success:true,data:employees});
    } catch(e){return fail(res,e);}
});
router.patch('/:id/assignments',async(req,res)=>{
    if(!req.body||(!Array.isArray(req.body.addEmployeeIds)&&!Array.isArray(req.body.removeEmployeeIds)))return res.status(400).json({success:false,message:'Provide employee additions or removals'});
    try{
      const data=await updatePackageEmployeeAssignments(req.params.id,req.body);
      const additions=[...new Set((req.body.addEmployeeIds||[]).map(Number).filter(Number.isInteger))];
      // Tagging grants eligibility; it does NOT email anyone. This used to send
      // the welcome as a side effect, so editing eligibility could post
      // thousands of messages with no review step and no way to see who was
      // about to receive one. Send deliberately via
      // POST /:id/invitations/send, or pass sendInvitations:true here to keep
      // the old one-step behaviour for a small, intentional batch.
      let invitations=null;
      if(additions.length&&req.body?.sendInvitations===true){
        invitations=await dispatchInvitations({packageId:req.params.id,userIds:additions,send:true});
      } else if(additions.length){
        const status=await invitationStatus(req.params.id).catch(()=>null);
        invitations=status?{sent:false,awaitingInvitation:status.counts.pending,armed:status.armed,hint:'POST /api/admin/health-packages/:id/invitations/send to send'}:null;
      }
      return res.json({success:true,data,invitations});
    }
    catch(e){return e.status?res.status(e.status).json({success:false,message:e.message}):fail(res,e);}
});
// ─────────────────────────────────────────────────────────────────────────────
// AHC WELCOME INVITATIONS — prepared/sent ledger and an explicit send
//
// Mirrors the account-welcome surface already used for Ninjacart
// (/admin/corporate-employee-welcome-emails/{prepare-bulk,send,deliveries}):
// see who is waiting, then fire when you choose. The "pending" list is derived
// from the entitlement and the notification ledger rather than pre-created
// rows, because corporate_ahc_entitlement_notifications is the idempotency
// guard — staging a row there would make the real send look like a duplicate.
// That is how the account-welcome design ended up with 5,581 rows stuck at
// 'prepared' and never sent.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /:id/invitations — who is entitled, who was invited, who is waiting. */
router.get('/:id/invitations', async (req, res) => {
  try {
    const status = await invitationStatus(req.params.id);
    return res.json({ success: true, data: status });
  } catch (e) {
    return e.status ? res.status(e.status).json({ success: false, message: e.message }) : fail(res, e);
  }
});

/**
 * POST /:id/invitations/send — fire the welcome email.
 *
 * Body: { userIds?: number[], send?: boolean, limit?: number }
 * Reports who WOULD receive one unless `send: true`, so the dangerous call is
 * never the accidental one. Omit userIds to target everyone entitled who has
 * not been invited for their current window.
 */
router.post('/:id/invitations/send', async (req, res) => {
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : null;
  if (userIds && userIds.length > MAX_PER_DISPATCH) {
    return res.status(400).json({ success: false, message: `Send at most ${MAX_PER_DISPATCH} invitations per request` });
  }
  try {
    const result = await dispatchInvitations({
      packageId: req.params.id,
      userIds,
      send: req.body?.send === true,
      limit: req.body?.limit,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return e.status ? res.status(e.status).json({ success: false, message: e.message }) : fail(res, e);
  }
});

/** One audited HR-requested extension per employee; never beyond the corporate AHC end date. */
router.post('/:id/extensions', async (req,res) => {
  const userId=Number(req.body?.userId), reason=String(req.body?.reason||'').trim(), hrRequestReference=String(req.body?.hrRequestReference||'').trim();
  if (!Number.isInteger(userId)||userId<1||!reason||!hrRequestReference) return res.status(400).json({success:false,message:'userId, HR request reference and reason are required'});
  try {
    const data=await db.transaction(async transaction => {
      const [p]=await query(`SELECT * FROM corporate_health_package_catalog WHERE id=:id AND metadata->>'kind'='health_checkup' FOR UPDATE`,{id:req.params.id},transaction);
      if(!p||!p.is_active) throw Object.assign(new Error('Active AHC package not found'),{status:404});
      const metadata=typeof p.metadata==='string'?JSON.parse(p.metadata):p.metadata||{};
      if(!metadata.corporateValidTo||Number(metadata.maxExtensionDays)!==15) throw Object.assign(new Error('This package does not permit AHC extensions'),{status:400});
      const [entitlement]=await query(`SELECT * FROM user_health_packages WHERE "packageId"=:id AND corporate_id=:corporateId AND "userId"=:userId FOR UPDATE`,{id:String(p.id),corporateId:p.corporate_id,userId},transaction);
      if(!entitlement||String(entitlement.status).toLowerCase()!=='active'||entitlement.usedAt) throw Object.assign(new Error('Only an active, unused AHC entitlement may be extended'),{status:409});
      const prior=await query(`SELECT id FROM corporate_ahc_entitlement_extensions WHERE package_id=:id AND user_id=:userId FOR UPDATE`,{id:String(p.id),userId},transaction);
      if(prior.length) throw Object.assign(new Error('This employee has already received the maximum AHC extension'),{status:409});
      const extension=ahcExtension({currentValidTo:String(entitlement.validTo).slice(0,10),corporateValidTo:metadata.corporateValidTo,extensionDays:req.body?.days||15,maxExtensionDays:metadata.maxExtensionDays});
      await query(`UPDATE user_health_packages SET "validTo"=:validTo,"updatedAt"=NOW() WHERE id=:id RETURNING id`,{id:entitlement.id,validTo:extension.newValidTo},transaction);
      await query(`INSERT INTO corporate_ahc_entitlement_extensions(package_id,corporate_id,user_id,old_valid_to,new_valid_to,granted_days,hr_request_reference,reason,granted_by) VALUES(:packageId,:corporateId,:userId,:oldValidTo,:newValidTo,:grantedDays,:hrRequestReference,:reason,:grantedBy) RETURNING id`,{packageId:String(p.id),corporateId:p.corporate_id,userId,oldValidTo:extension.oldValidTo,newValidTo:extension.newValidTo,grantedDays:extension.grantedDays,hrRequestReference,reason,grantedBy:req.user?.id||null},transaction);
      return extension;
    });
    void notifyAhcEntitlement({packageId:req.params.id,userId,eventType:'extension',validTo:data.newValidTo});
    return res.json({success:true,data});
  } catch(e) { return e.status?res.status(e.status).json({success:false,message:e.message}):fail(res,e); }
});
router.get('/:id/assignments', async (req,res) => {
    try {const rows=await query(`SELECT u."userId",u.status,u."validFrom",u."validTo",u."usedAt" FROM user_health_packages u JOIN corporate_health_package_catalog p ON p.id=u."packageId" AND p.corporate_id=u.corporate_id WHERE p.id=:id`,req.params);return res.json({success:true,data:rows});} catch(e){return fail(res,e);}
});
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
    if (!/^\d+$/.test(String(b.corporateId)) || !String(b.packageName || '').trim() || String(b.packageName).trim().length > 255 || !Array.isArray(b.tests) || !b.tests.length || b.tests.some(t => typeof t !== 'string' || !t.trim()) || !Number.isFinite(price) || price < 0 || !Number.isInteger(capacity) || capacity < 1 || !['Active', 'Inactive', 'Draft', 'Expired'].includes(b.status) || !['Annual', 'Bi-Annual', 'Quarterly', 'Monthly'].includes(b.frequency) || !isValidValidityPeriod(b.validityPeriod))
        return res.status(400).json({ success: false, message: 'Provide a corporate, package name, tests, valid status, frequency, validity, nonnegative cost and positive employee capacity' });
    const hasCorporateWindow=Boolean(b.corporateValidFrom||b.corporateValidTo);
    if (hasCorporateWindow) {
      try { ahcWindow({assignedOn:b.corporateValidFrom,validityPeriod:b.individualValidityPeriod||b.validityPeriod,corporateValidFrom:b.corporateValidFrom,corporateValidTo:b.corporateValidTo}); validityDays(b.individualValidityPeriod||b.validityPeriod); }
      catch (e) { return res.status(e.status||400).json({success:false,message:e.message}); }
      if (Number(b.maxExtensionDays ?? 15)!==15) return res.status(400).json({success:false,message:'AHC extensions are limited to 15 days'});
    }
    if ((b.eligibleRelations !== undefined && !validRelations(b.eligibleRelations)) || (b.venueMode !== undefined && !['inherit','restricted'].includes(b.venueMode)) || (b.venues !== undefined && (!Array.isArray(b.venues) || b.venues.some(v => !/^\d+$/.test(String(v.partnerId)) || !['lab','hospital'].includes(v.partnerType) || !['all',...BENEFICIARY_RELATIONS].includes(v.relation))))) return res.status(400).json({success:false,message:'Provide valid eligible relations and network venues'});
    if (b.venueMode === 'restricted' && !b.venues?.length) return res.status(400).json({success:false,message:'Select at least one venue for restricted packages'});
    if (req.params.id && !/^[A-Za-z0-9_-]{1,150}$/.test(req.params.id))
        return res.status(404).json({ success: false, message: 'Package not found' });
    try {
        const [corporate] = await query('SELECT id FROM corporates WHERE id=:id', { id: b.corporateId });
        if (!corporate)
            return res.status(404).json({ success: false, message: 'Corporate not found' });
        const metadata = JSON.stringify({ kind: 'health_checkup', corporateId: String(corporate.id), frequency: b.frequency, validityPeriod: b.validityPeriod, individualValidityPeriod: b.individualValidityPeriod || b.validityPeriod, corporateValidFrom: b.corporateValidFrom || null, corporateValidTo: b.corporateValidTo || null, maxExtensionDays: hasCorporateWindow ? 15 : 0, status: b.status, eligibleRelations: b.eligibleRelations || ['self'], venueMode: b.venueMode || 'inherit' });
        const replacements = { id: req.params.id, corporateId: corporate.id, name: b.packageName.trim(), description: String(b.description || ''), price, capacity, active: b.status === 'Active', features: JSON.stringify({ tests: b.tests, price, description: String(b.description || '') }), metadata, slug: `hc-${crypto.randomUUID()}` };
        const result = await db.transaction(async (transaction) => {
            async function saveVenues(id) {
                if (b.venues === undefined) return;
                for (const v of b.venues) {
                    const [network] = await query(`SELECT partner_id FROM corporate_network_assignments WHERE corporate_id=:corporateId AND partner_type=:partnerType AND partner_id=:partnerId FOR SHARE`, {corporateId:corporate.id,partnerId:Number(v.partnerId),partnerType:v.partnerType}, transaction);
                    if (!network) throw Object.assign(new Error('Every venue must belong to the corporate network'),{validation:true});
                }
                await query('DELETE FROM health_package_venues WHERE package_id=:id RETURNING package_id',{id},transaction);
                for (const v of b.venues) await query(`INSERT INTO health_package_venues (package_id,partner_id,partner_type,relation) VALUES (:id,:partnerId,:partnerType,:relation) ON CONFLICT DO NOTHING RETURNING package_id`,{id,partnerId:Number(v.partnerId),partnerType:v.partnerType,relation:v.relation},transaction);
            }

            if (req.params.id) {
                const [old] = await query(`${select} AND p.id=:id FOR UPDATE OF p`, { id: req.params.id }, transaction);
                if (!old)
                    return null;
                if (String(old.metadata.corporateId) !== String(b.corporateId))
                    throw Object.assign(new Error('A package cannot be moved to another corporate'), { validation: true });
                if (old.enrolled > capacity)
                    throw Object.assign(new Error('Capacity cannot be less than current enrollment'), { validation: true });
                replacements.metadata = JSON.stringify({...old.metadata,...JSON.parse(metadata),eligibleRelations:b.eligibleRelations ?? eligibleRelations(old.metadata),venueMode:b.venueMode ?? old.metadata.venueMode ?? 'inherit'});
                const [p] = await query(`UPDATE corporate_health_package_catalog SET name=:name,description=:description,price=:price,max_users=:capacity,is_active=:active,features=:features,metadata=:metadata,updated_at=NOW() WHERE id=:id RETURNING *`, replacements, transaction);
                await query(`UPDATE user_health_packages SET "packageName"=:name,"packageDetails"=:features,"updatedAt"=NOW() WHERE "packageId"=:id AND corporate_id=:corporateId RETURNING id`, { ...replacements, id: String(p.id), corporateId: corporate.id }, transaction);
                await saveVenues(p.id);
                return {...p,venues:b.venues};
            }
            const [p] = await query(`INSERT INTO corporate_health_package_catalog (id,corporate_id,name,slug,type,description,price,max_users,is_active,features,metadata,created_at,updated_at) VALUES (:slug,:corporateId,:name,:slug,'CORPORATE',:description,:price,:capacity,:active,:features,:metadata,NOW(),NOW()) RETURNING *`, replacements, transaction);
            await saveVenues(p.id);
            return {...p,venues:b.venues};
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
            const validityInterval = validityPeriodToInterval(p.metadata.validityPeriod);
            for (const employee of employees)
                await query(`INSERT INTO user_health_packages ("userId",corporate_id,"packageId","packageName","packageDetails","validFrom","validTo",status,"createdAt","updatedAt") VALUES (:userId,:corporateId,:packageId,:name,:details,CURRENT_DATE,CASE WHEN :years = 0 AND :days = 0 THEN NULL ELSE CURRENT_DATE+make_interval(years=>:years,days=>:days) END,'active',NOW(),NOW()) ON CONFLICT ("userId","packageId") DO UPDATE SET "packageName"=EXCLUDED."packageName","packageDetails"=EXCLUDED."packageDetails",status='active',"updatedAt"=NOW() RETURNING id`, { userId: employee.userId, corporateId: p.metadata.corporateId, packageId: String(p.id), name: p.name, details: JSON.stringify(p.features), years: validityInterval.years, days: validityInterval.days }, transaction);
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
