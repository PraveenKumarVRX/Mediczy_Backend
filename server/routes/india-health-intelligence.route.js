/**
 * India Health Intelligence Layer (Upgrade Plan Track A, Phase A4)
 *
 * Consolidates the India-specific integrations — ABDM/ABHA, Aadhaar
 * enrollment, C-CDA exchange, CDS Hooks, and multilingual document
 * generation — behind one documented /api/india-health/* namespace. Each
 * sub-path re-mounts the SAME router instance already mounted elsewhere in
 * app.js (see /_surface) — additive only, no existing integration's logic
 * is modified. Same pattern as routes/iam.route.js (Phase A3).
 *
 * Aadhaar/ABDM data handling is PII-sensitive: this consolidation changes
 * no access control on the underlying routers (they keep whatever auth
 * they already enforce) and adds none of its own beyond /_surface.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import abdmRouter from './abdm.route.js';
import abdmKioskRouter from './abdm-kiosk.route.js';
import cdaRouter from './cda.route.js';
import cdsHooksRouter from './cds-hooks.route.js';

const router = express.Router();

router.use('/abdm', abdmRouter);
router.use('/abdm/kiosk', abdmKioskRouter);
router.use('/cda', cdaRouter);
router.use('/cds-hooks', cdsHooksRouter);

// Multilingual generation lives in hospital-os.route.js (it shares the
// hospitalOs service aggregator); linked here for discoverability rather
// than re-mounted, since translateDocument/translateClinical aren't
// India-specific integrations in the same sense as the routers above.
router.get('/_surface', authUser, requireRole(['admin', 'system_admin']), (req, res) => {
  res.json({
    success: true,
    data: {
      consolidated: {
        '/api/india-health/abdm': 'abdm.route.js — ABDM/ABHA client (consent, PHI, care-context), Aadhaar enrollment',
        '/api/india-health/abdm/kiosk': 'abdm-kiosk.route.js',
        '/api/india-health/cda': 'cda.route.js — C-CDA discharge/referral/CCD/imaging documents',
        '/api/india-health/cds-hooks': 'cds-hooks.route.js — CDS Hooks standard',
      },
      legacySurfaces: {
        '/api/abdm': 'abdm.route.js',
        '/api/abdm/kiosk': 'abdm-kiosk.route.js',
        '/api/cda': 'cda.route.js',
        '/cds-hooks': 'cds-hooks.route.js',
      },
      relatedNotConsolidated: {
        '/api/hospital-os/translator': 'hospital-os.route.js — translateClinical (single-block text)',
        '/api/hospital-os/translator/document': 'hospital-os.route.js — translateDocument (multi-section document generation, Phase A4)',
      },
      note: 'All /api/india-health/* paths above are the same router instances mounted at their legacy paths — identical behavior, additive only. No existing integration file was modified for this consolidation.',
    },
  });
});

export default router;
