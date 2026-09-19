/**
 * Lab route registry — the single place that declares every lab-domain route
 * mount (path -> router). app.js calls mountLabRoutes(app, '<stage>') at the
 * SAME positions the individual app.use() lines used to occupy.
 *
 * Why stages instead of one call: app.js mounts broad routers (`/api`,
 * `/api/admin`, `/api/clinic`) between some of these paths, and Express
 * resolves overlapping paths in mount order. Keeping each stage at its
 * original position guarantees no request is routed differently than before.
 * (api-v1-labs.js is not here: it is mounted through api-v1-index.js.)
 */

import labIntegrationRouter from '../lab-integration.route.js';
import labTestsRouter from '../lab-tests.route.js';
import enhancedLabRouter from '../lab.route.enhanced.js';
import adminLabsRouter from '../admin/labs.routes.js';
import labAuthRouter from './auth.routes.js';
import labOrdersRouter from './orders.route.js';
import labRisImagingRouter from './ris-imaging.route.js';
import labBranchesRouter from './branches.route.js';
import labRuleEngineRouter from '../lab-rule-engine.route.js';

export const LAB_ROUTE_STAGES = {
  // Clinical workflow block: lab results, abnormal flagging, patient notifications
  doctorIntegration: [['/api/doctor/lab-integration', labIntegrationRouter]],
  // Patient-facing test catalog / lab test booking
  catalog: [['/api/lab-tests', labTestsRouter]],
  // Enhanced laboratory management with comprehensive search
  directory: [['/api/labs', enhancedLabRouter]],
  // Admin lab CRUD operations
  admin: [['/api/admin/labs', adminLabsRouter]],
  // Lab portal: auth, incoming EMR orders, RIS (PACS/DICOM; the clinic RIS
  // mount reuses the same router for dental OPG / C-arm / angio), branch registry
  portal: [
    ['/api/lab', labAuthRouter],
    ['/api/lab/orders', labOrdersRouter],
    ['/api/lab/ris', labRisImagingRouter],
    ['/api/clinic/ris', labRisImagingRouter],
    ['/api/lab/branches', labBranchesRouter],
  ],
  // Lab rule engine (v1 API)
  rules: [['/api/v1/lab-rules', labRuleEngineRouter]],
};

export function mountLabRoutes(app, stage) {
  const mounts = LAB_ROUTE_STAGES[stage];
  if (!mounts) throw new Error(`Unknown lab route stage: ${stage}`);
  for (const [path, router] of mounts) app.use(path, router);
}
