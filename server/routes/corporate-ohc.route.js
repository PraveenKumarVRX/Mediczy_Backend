/** /api/corporate/ohc-units — the corporate's view of the OHCs that serve it (dashboard, staff, certificates, contract). */
import { careUnitService, careUnitPool } from '../services/care-units/index.js';
import { authCorporate } from '../middleware/corporate.middleware.js';
import { forbidden } from '../services/collection/errors.js';
import { buildCorporateOhcRouter } from './care-units/corporate-ohc.router.js';

async function resolvePrincipal(req) {
  const { rows } = await careUnitPool.query('SELECT unique_id FROM corporates WHERE id = $1', [req.corporateUser?.id]);
  const uid = rows[0]?.unique_id;
  if (!uid) throw forbidden('This corporate has no entity uid');
  return { type: 'corporate', corporateUid: uid, ref: `corporate:${uid}:${req.user?.userId || req.user?.id || 'account'}` };
}

export default buildCorporateOhcRouter({ service: careUnitService, authenticate: authCorporate, resolvePrincipal });
