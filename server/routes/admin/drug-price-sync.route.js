/**
 * Admin: Drug Price Sync API
 *
 * GET  /api/admin/drug-price-sync/status      → last sync result + current state
 * POST /api/admin/drug-price-sync/run         → trigger full sync immediately
 * POST /api/admin/drug-price-sync/upload      → upload Excel/CSV with drug prices
 * GET  /api/admin/drug-price-sync/preview     → price distribution stats
 */

import express from 'express';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import {
  runFullSync,
  getSyncStatus,
  syncFromUploadedFile,
  syncFromOpenMRP,
  syncFromIndianMedicineDataset,
} from '../../services/drug-price-sync.service.js';
import sharedPool from '../../db/pgPool.js';

const router = express.Router();

// All routes require admin auth
router.use(authUser, requireRole('admin'));

// ── GET /status ───────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { isSyncing, lastSyncResult } = getSyncStatus();

    // Live DB stats
    const statsRes = await sharedPool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE mrp > 0)                AS with_price,
        COUNT(*) FILTER (WHERE mrp IS NULL OR mrp = 0) AS without_price,
        COUNT(*) FILTER (WHERE selling_price > 0)      AS with_selling_price,
        COUNT(*) FILTER (WHERE openmrp_id IS NOT NULL) AS with_openmrp_id,
        COUNT(*) FILTER (WHERE is_discontinued = TRUE) AS discontinued,
        ROUND(AVG(mrp) FILTER (WHERE mrp > 0), 2)     AS avg_mrp,
        MIN(mrp) FILTER (WHERE mrp > 0)                AS min_mrp,
        MAX(mrp) FILTER (WHERE mrp > 0)                AS max_mrp
      FROM pharmacy_medicines
    `);

    const bySourceRes = await sharedPool.query(`
      SELECT price_source, COUNT(*) AS count
      FROM pharmacy_medicines
      GROUP BY price_source
      ORDER BY count DESC
    `);

    const byDatasetRes = await sharedPool.query(`
      SELECT dataset_source, COUNT(*) AS count
      FROM pharmacy_medicines
      WHERE dataset_source IS NOT NULL
      GROUP BY dataset_source
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      isSyncing,
      lastSync: lastSyncResult,
      dbStats: statsRes.rows[0],
      bySources: bySourceRes.rows,
      byDataset: byDatasetRes.rows,
      availableSources: [
        { key: 'builtin',                  description: 'Built-in MRP corrections for known CIMS errors', runTime: 'seconds' },
        { key: 'nppa',                     description: 'NPPA government DPCO ceiling prices (Excel download)', runTime: '~1 min' },
        { key: 'janaushadhi',              description: 'Jan Aushadhi generic drug MRP list (PMBI)', runTime: '~1 min' },
        { key: 'openmrp',                  description: 'OpenMRP API — selling_price for ~2000 medicines per run (rate-limited)', runTime: '~30-60 min' },
        { key: 'indian_medicine_dataset',  description: 'Indian Medicine Dataset (junioralive/GitHub) — ~253k medicines bulk seed', runTime: '~10-20 min' },
      ],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /run ─────────────────────────────────────────────────────────────────
router.post('/run', async (req, res) => {
  const { sources } = req.body; // optional: ['builtin', 'nppa', 'janaushadhi']

  // Non-blocking: start sync and return immediately
  runFullSync({ sources }).then(result => {
    console.log(`💊 [admin-trigger] Sync complete — updated ${result.totalUpdated}`);
  }).catch(err => {
    console.error('💊 [admin-trigger] Sync error:', err.message);
  });

  res.json({
    success: true,
    message: 'Price sync started in background. Check /status for progress.',
    sources: sources || ['builtin', 'nppa', 'janaushadhi'],
  });
});

// ── POST /upload ──────────────────────────────────────────────────────────────
// Accepts multipart Excel or CSV with columns: generic_name, strength, mrp
// OR: brand_name, mrp
// OR: Drug Name, Strength, Ceiling Price  (NPPA format)
router.post('/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Send as multipart field "file".' });
    }

    const file = req.files.file;

    // Size guard (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File too large (max 5 MB)' });
    }

    // Extension guard
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'Only .xlsx, .xls, or .csv files accepted' });
    }

    const result = await syncFromUploadedFile(file.data, file.name);

    res.json({
      success: true,
      message: `Upload processed — ${result.updated} drug records updated`,
      result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /preview ──────────────────────────────────────────────────────────────
router.get('/preview', async (req, res) => {
  try {
    const topRes = await sharedPool.query(`
      SELECT generic_name, strength, form, pack_size, price_source,
             COUNT(*) AS variants,
             MIN(mrp)::numeric(10,2) AS min_mrp,
             MAX(mrp)::numeric(10,2) AS max_mrp,
             ROUND(AVG(mrp), 2)     AS avg_mrp
      FROM pharmacy_medicines
      WHERE mrp > 0 AND generic_name IS NOT NULL
      GROUP BY generic_name, strength, form, pack_size, price_source
      ORDER BY generic_name, strength
      LIMIT 200
    `);

    const outlierRes = await sharedPool.query(`
      SELECT name, generic_name, strength, form, pack_size, mrp, price_source
      FROM pharmacy_medicines
      WHERE mrp > 1000
      ORDER BY mrp DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      preview: topRes.rows,
      highPriceOutliers: outlierRes.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
