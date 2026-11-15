/**
 * Lab price-list maintenance (owner decision 2026-11-15: labs set their own
 * test lists and prices). services/lab-test-prices.service.js does the work;
 * services/lab-booking-pricing.service.js is what booking reads.
 *
 * Lab portal — the lab's own login (authLab), its own lab only:
 *   GET    /api/lab/test-prices/catalogue      catalogue tests to choose from
 *   GET    /api/lab/test-prices                the lab's price list (?includeInactive=true)
 *   POST   /api/lab/test-prices                add or update one test { testId|testCode, price, isActive? }
 *   POST   /api/lab/test-prices/bulk           { rows: [...] } or { csv: "..." }, optional dryRun
 *   PATCH  /api/lab/test-prices/:testId        { price?, isActive? }
 *   DELETE /api/lab/test-prices/:testId        stop offering the test (deactivate)
 *
 * Admin — admin / super-admin users (authUser + requireRole('admin')), any lab
 * by numeric id or lab uid:
 *   GET    /api/admin/lab-test-prices/catalogue
 *   GET    /api/admin/lab-test-prices/:labRef
 *   POST   /api/admin/lab-test-prices/:labRef
 *   POST   /api/admin/lab-test-prices/:labRef/bulk
 *   PATCH  /api/admin/lab-test-prices/:labRef/:testId
 *   DELETE /api/admin/lab-test-prices/:labRef/:testId
 *
 * Ring-fencing: '/api/lab' is on the lab user type's allow-list and
 * '/api/admin' on admin's; neither is on the patient/user list, so a patient
 * token is refused before routing.
 */
import express from 'express';
import { authLab } from '../../middleware/authLab.middleware.js';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import labPrices, { LabPriceListError } from '../../services/lab-test-prices.service.js';

function sendError(res, error, context) {
  if (error instanceof LabPriceListError) return res.status(error.status).json(error.toJSON());
  console.error(`[lab-test-prices] ${context}:`, error.message);
  return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Unable to update the price list right now' });
}

/** Rows from a bulk body: JSON rows, or CSV text. */
function bulkRows(body = {}) {
  if (Array.isArray(body.rows)) return body.rows;
  if (typeof body.csv === 'string') return labPrices.parseCsv(body.csv);
  throw new LabPriceListError('Send rows (a JSON array) or csv (text with a header row).', { code: 'NO_ROWS' });
}

const includeInactive = (req) => ['true', '1', 'yes'].includes(String(req.query.includeInactive || '').toLowerCase());

/**
 * The handlers both mounts share. `labFor(req)` answers the lab being edited
 * (or null for 404); `actorFor(req)` the editor's uid.
 */
function addPriceRoutes(router, { prefix, labFor, actorFor }) {
  const root = prefix || '/';
  router.get(root, async (req, res) => {
    try {
      const lab = await labFor(req);
      if (!lab) return res.status(404).json({ success: false, code: 'LAB_NOT_FOUND', message: 'Lab not found' });
      return res.json({ success: true, ...(await labPrices.listLabPrices(lab, { includeInactive: includeInactive(req) })) });
    } catch (error) { return sendError(res, error, 'list'); }
  });

  router.post(root, async (req, res) => {
    try {
      const lab = await labFor(req);
      if (!lab) return res.status(404).json({ success: false, code: 'LAB_NOT_FOUND', message: 'Lab not found' });
      const result = await labPrices.upsertLabPrices(lab, [req.body || {}], { actorUid: await actorFor(req) });
      return res.status(result.created ? 201 : 200).json({ success: true, price: result.results[0], ...result });
    } catch (error) { return sendError(res, error, 'upsert'); }
  });

  router.post(`${prefix}/bulk`, async (req, res) => {
    try {
      const lab = await labFor(req);
      if (!lab) return res.status(404).json({ success: false, code: 'LAB_NOT_FOUND', message: 'Lab not found' });
      const rows = bulkRows(req.body);
      const dryRun = req.body?.dryRun === true || String(req.query.dryRun || '') === 'true';
      const result = await labPrices.upsertLabPrices(lab, rows, { actorUid: await actorFor(req), dryRun });
      return res.json({ success: true, ...result });
    } catch (error) {
      // For CSV, also say which line of the file (line 1 is the header).
      if (error instanceof LabPriceListError && error.errors && typeof req.body?.csv === 'string' && !Array.isArray(req.body?.rows)) {
        error.errors = error.errors.map((e) => ({ ...e, line: e.row + 1 }));
      }
      return sendError(res, error, 'bulk');
    }
  });

  router.patch(`${prefix}/:testId`, async (req, res) => {
    try {
      const lab = await labFor(req);
      if (!lab) return res.status(404).json({ success: false, code: 'LAB_NOT_FOUND', message: 'Lab not found' });
      const price = await labPrices.updateLabPrice(lab, req.params.testId, req.body || {}, { actorUid: await actorFor(req) });
      return res.json({ success: true, price });
    } catch (error) { return sendError(res, error, 'update'); }
  });

  router.delete(`${prefix}/:testId`, async (req, res) => {
    try {
      const lab = await labFor(req);
      if (!lab) return res.status(404).json({ success: false, code: 'LAB_NOT_FOUND', message: 'Lab not found' });
      const price = await labPrices.deactivateLabPrice(lab, req.params.testId, { actorUid: await actorFor(req) });
      return res.json({ success: true, price });
    } catch (error) { return sendError(res, error, 'deactivate'); }
  });
}

async function sendCatalogue(req, res) {
  try {
    return res.json({ success: true, tests: await labPrices.listCatalogue() });
  } catch (error) { return sendError(res, error, 'catalogue'); }
}

// ── Lab portal: the signed-in lab, never a lab named in the request ──────────
export const labPortalTestPricesRouter = express.Router();
labPortalTestPricesRouter.use(authLab);
labPortalTestPricesRouter.get('/catalogue', sendCatalogue);
addPriceRoutes(labPortalTestPricesRouter, {
  prefix: '',
  labFor: (req) => labPrices.resolveLab(req.lab?.id),
  actorFor: (req) => labPrices.actorUid({ labId: req.lab?.id }),
});

// ── Admin: any lab, by id or uid ─────────────────────────────────────────────
export const adminLabTestPricesRouter = express.Router();
adminLabTestPricesRouter.use(authUser, requireRole(['admin']));
adminLabTestPricesRouter.get('/catalogue', sendCatalogue);
addPriceRoutes(adminLabTestPricesRouter, {
  prefix: '/:labRef',
  labFor: (req) => labPrices.resolveLab(req.params.labRef),
  actorFor: (req) => labPrices.actorUid({ userId: req.user?.id }),
});

export default labPortalTestPricesRouter;
