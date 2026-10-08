/** /api/ohc-workspace — sign-in and workspace for ohc_doctor / ohc_staff. */
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { isTokenRevoked } from '../services/token-revocation.service.js';
import { createAuthOhc } from '../middleware/ohcAuth.middleware.js';
import { ohcService } from '../services/care-units/index.js';
import { generateFitnessCertificatePdf, fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';
import { buildOhcWorkspaceRouter } from './care-units/ohc-workspace.router.js';

export default buildOhcWorkspaceRouter({
  ohc: ohcService,
  authenticate: createAuthOhc({ ohc: ohcService, isTokenRevoked }),
  limiter: authLimiter,
  renderPdf: generateFitnessCertificatePdf,
  pdfPathOf: fitnessCertificatePdfPath,
});
