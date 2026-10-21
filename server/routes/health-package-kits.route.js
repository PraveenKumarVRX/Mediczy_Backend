/** Kit endpoints are aliases of the corporate health-checkup package catalog. */
import express from 'express';
import jwt from 'jsonwebtoken';
import { authUser } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { requireCorporateAccess } from '../middleware/corporateTenant.js';
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import adminPackagesRouter from './admin-health-packages.route.js';

const router = express.Router();
router.use((req, res, next) => {
  // Decoding only selects the authenticator; both authenticators verify the token.
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return jwt.decode(token || '')?.role === 'lab'
    ? authLab(req, res, next)
    : authUser(req, res, next);
});
router.use((req, res, next) => {
  if (req.lab) return next();
  const role = req.userRole || req.user?.role;
  if (req.user?.isAdmin || ['admin', 'super_admin', 'system_admin'].includes(role)) {
    req.kitAdmin = true;
    return next();
  }
  if (req.user?.isTeam || ['team', 'team_member', 'team_lead'].includes(role)) {
    if (!req.query.corporateId) return res.status(400).json({success:false,message:'corporateId is required'});
    req.params.corporateId = req.query.corporateId;
    return requireCorporateAccess(req, res, next);
  }
  return res.status(403).json({success:false,message:'Admin, assigned Team or Lab access required'});
});

async function read(req, res) {
  const corporateId = req.resolvedCorporate?.id || req.query.corporateId;
  if (corporateId && !/^\d+$/.test(String(corporateId))) return res.status(400).json({success:false,message:'A numeric corporateId is required'});
  const where = ["p.metadata->>'kind'='health_checkup'"];
  const replacements = {};
  if (!req.kitAdmin) where.push('p.is_active=true');
  if (corporateId) { where.push('p.corporate_id=:corporateId'); replacements.corporateId = Number(corporateId); }
  if (req.lab) {
    where.push(`EXISTS (SELECT 1 FROM corporate_network_assignments a JOIN labs l ON l.id=a.partner_id AND LOWER(l.status)='active' AND l."isVerified"=true WHERE a.corporate_id=p.corporate_id AND a.partner_type='lab' AND a.partner_id=:labId)`);
    replacements.labId = Number(req.lab.id);
  }
  if (req.params.id) { where.push('p.id=:id'); replacements.id = req.params.id; }
  try {
    const rows = await db.query(`SELECT p.id,p.corporate_id,p.name,p.description,p.features,p.price,p.currency,p.max_users,p.is_active,p.metadata
      FROM corporate_health_package_catalog p WHERE ${where.join(' AND ')} ORDER BY p.name,p.id`, {replacements,type:db.QueryTypes.SELECT});
    const kits = rows.map(p => ({id:String(p.id),corporateId:String(p.corporate_id),name:p.name,packageName:p.name,
      description:p.description,tests:p.features?.tests || [],price:Number(p.price),currency:p.currency,
      maxEmployees:p.max_users,status:p.metadata?.status || (p.is_active?'Active':'Inactive')}));
    if (req.params.id) return kits.length
      ? res.json({success:true,data:kits[0],kit:kits[0],package:kits[0]})
      : res.status(404).json({success:false,message:'Health checkup package not found'});
    return res.json({success:true,data:kits,kits,packages:kits});
  } catch (error) {
    console.error('[health-package-kits]', error.message);
    return res.status(500).json({success:false,message:'Unable to load health checkup packages'});
  }
}
router.get('/', read);
router.get('/:id', read);
// All mutations reuse the existing admin package validation and transactions.
router.use((req, res, next) => req.kitAdmin
  ? next()
  : res.status(403).json({success:false,message:'Admin access required to manage packages'}));
router.use(adminPackagesRouter);
export default router;
