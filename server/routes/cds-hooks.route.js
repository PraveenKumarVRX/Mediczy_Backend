/**
 * CDS Hooks Routes
 * =================
 * Implements the HL7 CDS Hooks 2.0 discovery and service endpoints.
 *
 * Endpoints:
 *   GET  /cds-hooks/                    — Discovery document (public, no auth)
 *   POST /cds-hooks/patient-view        — Health risk card on chart open
 *   POST /cds-hooks/medication-prescribe — Drug interaction + allergy check
 *   POST /cds-hooks/order-sign          — Duplicate order + allergy gate
 *   POST /cds-hooks/encounter-start     — ABHA / care-context summary
 *
 * Authentication:
 *   The discovery endpoint is intentionally unauthenticated per the CDS Hooks
 *   specification (§4.1). All hook POST endpoints require a valid Mediczy JWT
 *   (authUser middleware).
 *
 * Request body (hook POSTs) follows the CDS Hooks spec:
 *   {
 *     hook:         string,      // e.g. "patient-view"
 *     hookInstance: string,      // caller-generated UUID per invocation
 *     context:      {
 *       patientId:    string | number,
 *       // hook-specific fields:
 *       medications?: Array<{ name: string } | string>,   // medication-prescribe
 *       orders?:      Array<{ medication: string } | string>, // order-sign
 *       encounterId?: string,                               // encounter-start
 *     }
 *   }
 *
 * Response:
 *   { cards: [ { summary, detail, indicator, source, suggestions } ] }
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import cdsHooksService from '../services/cds-hooks.service.js';

const router = express.Router();

// ─── Discovery (public — no auth per CDS Hooks spec §4.1) ────────────────────

/**
 * GET /cds-hooks/
 * Returns the CDS Hooks discovery document listing all registered services.
 */
router.get('/', (req, res) => {
  try {
    const discovery = cdsHooksService.getDiscovery();
    res.json(discovery);
  } catch (err) {
    console.error('[CDS Hooks] Discovery error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve CDS Hooks discovery document' });
  }
});

// ─── Hook endpoints (all require authenticated user) ─────────────────────────

/**
 * POST /cds-hooks/patient-view
 * Returns AI health risk score card when a patient chart is opened.
 */
router.post('/patient-view', authUser, async (req, res) => {
  try {
    const context = req.body?.context || {};
    const result  = await cdsHooksService.handlePatientView(context);
    res.json(result);
  } catch (err) {
    console.error('[CDS Hooks] /patient-view error:', err.message);
    res.status(500).json({ cards: [] });
  }
});

/**
 * POST /cds-hooks/medication-prescribe
 * Returns drug interaction and allergy warning cards at prescribe time.
 */
router.post('/medication-prescribe', authUser, async (req, res) => {
  try {
    const context = req.body?.context || {};
    const result  = await cdsHooksService.handleMedicationPrescribe(context);
    res.json(result);
  } catch (err) {
    console.error('[CDS Hooks] /medication-prescribe error:', err.message);
    res.status(500).json({ cards: [] });
  }
});

/**
 * POST /cds-hooks/order-sign
 * Returns duplicate order detection and allergy safety cards before signing.
 */
router.post('/order-sign', authUser, async (req, res) => {
  try {
    const context = req.body?.context || {};
    const result  = await cdsHooksService.handleOrderSign(context);
    res.json(result);
  } catch (err) {
    console.error('[CDS Hooks] /order-sign error:', err.message);
    res.status(500).json({ cards: [] });
  }
});

/**
 * POST /cds-hooks/encounter-start
 * Returns ABHA ID / care-context summary and clinical snapshot at encounter start.
 */
router.post('/encounter-start', authUser, async (req, res) => {
  try {
    const context = req.body?.context || {};
    const result  = await cdsHooksService.handleEncounterStart(context);
    res.json(result);
  } catch (err) {
    console.error('[CDS Hooks] /encounter-start error:', err.message);
    res.status(500).json({ cards: [] });
  }
});

export default router;
