/**
 * HyperGrid Semantic Terminology API
 *
 * POST   /api/hypergrid/terminology/resolve         Resolve a single code
 * POST   /api/hypergrid/terminology/resolve/batch   Batch resolve codes
 * POST   /api/hypergrid/terminology/codes           Register a local code mapping
 * GET    /api/hypergrid/terminology/codes           List custom mappings (tenant)
 * DELETE /api/hypergrid/terminology/codes/:id       Remove custom mapping
 * GET    /api/hypergrid/terminology/systems         Supported code systems
 * GET    /api/hypergrid/terminology/search          Search catalogue
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';
import {
  resolveConcept,
  batchResolve,
  registerLocalCode,
} from '../services/hypergrid-terminology.service.js';

const router = express.Router();

const SUPPORTED_SYSTEMS = [
  { id: 'icd10',  name: 'ICD-10',     url: 'http://hl7.org/fhir/sid/icd-10'   },
  { id: 'icd11',  name: 'ICD-11',     url: 'https://icd.who.int/browse11'      },
  { id: 'snomed', name: 'SNOMED CT',  url: 'http://snomed.info/sct'             },
  { id: 'loinc',  name: 'LOINC',      url: 'http://loinc.org'                  },
  { id: 'rxnorm', name: 'RxNorm',     url: 'http://www.nlm.nih.gov/research/umls/rxnorm' },
  { id: 'cpt',    name: 'CPT',        url: 'http://www.ama-assn.org/go/cpt'    },
  { id: 'ndc',    name: 'NDC',        url: 'http://hl7.org/fhir/sid/ndc'       },
  { id: 'local',  name: 'Local/Custom codes', url: null                         },
];

// ── Resolve single code ───────────────────────────────────────────────────────
router.post('/resolve', authUser, async (req, res) => {
  try {
    const { code, system } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'code is required' });
    const concept = await resolveConcept(code, system || null);
    res.json({ success: true, input: { code, system: system || 'auto' }, concept });
  } catch (err) {
    console.error('[Terminology] Resolve error:', err);
    res.status(500).json({ success: false, message: 'Resolution failed' });
  }
});

// ── Batch resolve ─────────────────────────────────────────────────────────────
router.post('/resolve/batch', authUser, async (req, res) => {
  try {
    const { codes, system } = req.body;
    if (!Array.isArray(codes) || codes.length === 0)
      return res.status(400).json({ success: false, message: 'codes array required' });
    if (codes.length > 500)
      return res.status(400).json({ success: false, message: 'Maximum 500 codes per batch' });

    const map     = await batchResolve(codes, system || null);
    const results = {};
    map.forEach((v, k) => { results[k] = v; });
    res.json({ success: true, resolved: results, total: codes.length });
  } catch (err) {
    console.error('[Terminology] Batch resolve error:', err);
    res.status(500).json({ success: false, message: 'Batch resolution failed' });
  }
});

// ── Register local code mapping ───────────────────────────────────────────────
router.post('/codes', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { sourceCode, sourceSystem, display, snomedCode,
            snomedDisplay, icd10, icd11, loinc, rxnorm } = req.body;
    if (!sourceCode || !sourceSystem || !display)
      return res.status(400).json({ success: false, message: 'sourceCode, sourceSystem, display required' });

    await registerLocalCode({
      sourceCode, sourceSystem, display,
      snomedCode:    snomedCode    || null,
      snomedDisplay: snomedDisplay || null,
      icd10:  icd10  || null,
      icd11:  icd11  || null,
      loinc:  loinc  || null,
      rxnorm: rxnorm || null,
      tenantId: req.user.tenantId || req.user.id,
    });
    res.status(201).json({ success: true, message: 'Code mapping registered' });
  } catch (err) {
    console.error('[Terminology] Register code error:', err);
    res.status(500).json({ success: false, message: 'Failed to register code' });
  }
});

// ── List custom mappings ──────────────────────────────────────────────────────
router.get('/codes', authUser, async (req, res) => {
  try {
    const { system, limit = 50, page = 1 } = req.query;
    const tenantId = req.user.tenantId || req.user.id;
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const pool     = await connectPostgres();
    const r = await pool.query(
      `SELECT * FROM hg_code_map
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR source_system = $2)
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [tenantId, system || null, parseInt(limit), offset]
    );
    res.json({ success: true, codes: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list codes' });
  }
});

// ── Delete custom mapping ─────────────────────────────────────────────────────
router.delete('/codes/:id', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `DELETE FROM hg_code_map WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.tenantId || req.user.id]
    );
    res.json({ success: true, message: 'Mapping deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete mapping' });
  }
});

// ── Supported systems ─────────────────────────────────────────────────────────
router.get('/systems', (req, res) => {
  res.json({ success: true, systems: SUPPORTED_SYSTEMS });
});

// ── Search catalogue ──────────────────────────────────────────────────────────
router.get('/search', authUser, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || q.length < 2)
      return res.status(400).json({ success: false, message: 'q must be at least 2 characters' });
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT snomed_code, snomed_display, icd10, icd11, loinc, rxnorm, display,
              similarity(display, $1) AS sim
       FROM hg_terminology
       WHERE display ILIKE $2 OR display % $1
       ORDER BY sim DESC
       LIMIT $3`,
      [q, `%${q}%`, parseInt(limit)]
    );
    res.json({ success: true, results: r.rows, query: q });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

export default router;
