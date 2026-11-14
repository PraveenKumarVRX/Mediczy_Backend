/**
 * The app-facing API contract, for admins.
 *
 *   GET /api/admin/openapi/app.json   the OpenAPI 3.0.3 document
 *   GET /api/admin/openapi/docs       Swagger UI over it
 *
 * Admin-only, like the older /api-docs. The same document is committed at
 * server/openapi/dist/app.openapi.json for the app team and partners.
 */
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { buildAppSpec } from '../openapi/index.js';

const router = express.Router();
const spec = buildAppSpec();

router.get('/app.json', authUser, requireRole('admin'), (req, res) => res.json(spec));

router.use('/docs', authUser, requireRole('admin'), swaggerUi.serveFiles(spec), swaggerUi.setup(spec, {
  customSiteTitle: 'My SmartHealth app API',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, tryItOutEnabled: false },
}));

export default router;
