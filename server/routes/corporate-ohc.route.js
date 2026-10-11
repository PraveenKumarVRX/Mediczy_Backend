/** /api/corporate/ohc-units — the corporate's view of the OHCs that serve it (dashboard, staff, certificates, contract). */
import { careUnitService, ohcService, careUnitPool } from '../services/care-units/index.js';
import { authCorporate } from '../middleware/corporate.middleware.js';
import { forbidden } from '../services/collection/errors.js';
import { generateFitnessCertificatePdf, fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';
import { buildCorporateOhcRouter } from './care-units/corporate-ohc.router.js';

async function resolvePrincipal(req) {
  const { rows } = await careUnitPool.query('SELECT unique_id FROM corporates WHERE id = $1', [req.corporateUser?.id]);
  const uid = rows[0]?.unique_id;
  if (!uid) throw forbidden('This corporate has no entity uid');
  const principal = { type: 'corporate', corporateUid: uid, ref: `corporate:${uid}:${req.user?.userId || req.user?.id || 'account'}` };
  // The CMO's own OHC-shaped principal (units/registrationNumber), reused as-is for the clinical
  // actions below instead of re-deriving it — req.user.userId is the CMO's own user id, distinct
  // from req.corporateUser.id above (the corporate's own id).
  if (req.user?.role === 'corporate_cmo' && req.user?.userId) {
    const { rows: ur } = await careUnitPool.query('SELECT unique_id FROM users WHERE id = $1', [req.user.userId]);
    if (ur[0]?.unique_id) {
      const { principal: ohcPrincipal } = await ohcService.loadPrincipal(ur[0].unique_id);
      if (ohcPrincipal) principal.ohc = ohcPrincipal;
    }
  }
  return principal;
}

export default buildCorporateOhcRouter({
  service: careUnitService, ohcService, authenticate: authCorporate, resolvePrincipal,
  renderPdf: generateFitnessCertificatePdf, pdfPathOf: fitnessCertificatePdfPath,
});
