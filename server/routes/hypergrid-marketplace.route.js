/**
 * HyperGrid App Marketplace & Network Layer API
 *
 * Governs the ecosystem of apps, providers, and benchmarks on HyperGrid.
 *
 * Apps (third-party SMART / HyperGrid native):
 * POST   /api/hypergrid/marketplace/apps              Submit app for review
 * GET    /api/hypergrid/marketplace/apps              Browse marketplace
 * GET    /api/hypergrid/marketplace/apps/:id          App detail + reviews
 * POST   /api/hypergrid/marketplace/apps/:id/review   Admin approve/reject
 * POST   /api/hypergrid/marketplace/apps/:id/install  Tenant installs app
 * DELETE /api/hypergrid/marketplace/apps/:id/install  Tenant uninstalls
 * GET    /api/hypergrid/marketplace/apps/:id/ratings  Reviews & ratings
 * POST   /api/hypergrid/marketplace/apps/:id/rate     Submit rating
 *
 * Network participants:
 * POST   /api/hypergrid/marketplace/network/participants   Register participant
 * GET    /api/hypergrid/marketplace/network/participants   List participants
 * GET    /api/hypergrid/marketplace/network/stats         Network health stats
 *
 * Benchmarking:
 * POST   /api/hypergrid/marketplace/benchmarks            Submit anonymised benchmark
 * GET    /api/hypergrid/marketplace/benchmarks            Query benchmark percentiles
 *
 * Developer portal:
 * GET    /api/hypergrid/marketplace/developer/stats       Developer/usage stats (auth)
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';
import { publishEvent }          from '../services/hypergrid-event-bus.service.js';
import { requireHgTenant } from '../utils/hypergrid-tenant.js';

const router = express.Router();

const APP_CATEGORIES = ['Clinical Decision Support', 'Revenue Cycle', 'Patient Engagement',
  'Analytics', 'IoT / Device', 'AI Diagnostics', 'Pharmacy', 'Insurance', 'Scheduling',
  'Telemedicine', 'Supply Chain', 'Education', 'Other'];

// ─── Apps ─────────────────────────────────────────────────────────────────────

router.post('/apps', authUser, async (req, res) => {
  try {
    const { name, description, category, logoUrl, websiteUrl,
            demoUrl, smartClientId, pricing, tags } = req.body;
    if (!name || !description || !category)
      return res.status(400).json({ success: false, message: 'name, description, category required' });
    if (!APP_CATEGORIES.includes(category))
      return res.status(400).json({ success: false,
        message: `category must be one of: ${APP_CATEGORIES.join(', ')}` });

    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_marketplace_apps
         (name, description, category, logo_url, website_url, demo_url,
          smart_client_id, pricing, tags, submitted_by, review_status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',NOW())
       RETURNING id, name, category, review_status, created_at`,
      [name, description, category, logoUrl || null, websiteUrl || null, demoUrl || null,
       smartClientId || null, JSON.stringify(pricing || { model: 'free' }),
       JSON.stringify(tags || []), req.user.id]
    );
    res.status(201).json({ success: true, app: r.rows[0],
      message: 'App submitted for review. Expect a decision within 3–5 business days.' });
  } catch (err) {
    console.error('[Marketplace] Submit app error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit app' });
  }
});

router.get('/apps', async (req, res) => {
  try {
    const { category, search, status = 'approved', limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pool   = await connectPostgres();
    const r      = await pool.query(
      `SELECT id, name, description, category, logo_url, website_url, pricing,
              tags, avg_rating, install_count, review_status, created_at
       FROM hg_marketplace_apps
       WHERE review_status = $1
         AND ($2::text IS NULL OR category = $2)
         AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%'
                               OR description ILIKE '%' || $3 || '%')
       ORDER BY install_count DESC, avg_rating DESC
       LIMIT $4 OFFSET $5`,
      [status, category || null, search || null, parseInt(limit), offset]
    );
    res.json({ success: true, apps: r.rows, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to browse apps' });
  }
});

router.get('/apps/:id', async (req, res) => {
  try {
    const pool = await connectPostgres();
    const [app, ratings] = await Promise.all([
      pool.query(`SELECT * FROM hg_marketplace_apps WHERE id = $1`, [req.params.id]),
      pool.query(
        `SELECT rating, review_text, created_at FROM hg_app_ratings
         WHERE app_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [req.params.id]
      ),
    ]);
    if (!app.rows[0]) return res.status(404).json({ success: false, message: 'App not found' });
    res.json({ success: true, app: app.rows[0], recentRatings: ratings.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get app' });
  }
});

router.post('/apps/:id/review', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const { decision, notes } = req.body;
    if (!['approved', 'rejected'].includes(decision))
      return res.status(400).json({ success: false, message: 'decision must be approved or rejected' });
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_marketplace_apps SET review_status = $2, review_notes = $3, reviewed_by = $4,
       reviewed_at = NOW() WHERE id = $1`,
      [req.params.id, decision, notes || null, req.user.id]
    );
    res.json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Review failed' });
  }
});

router.post('/apps/:id/install', authUser, requireHgTenant, async (req, res) => {
  try {
    const pool     = await connectPostgres();
    const tenantId = req.hgTenantId;
    await pool.query(
      `INSERT INTO hg_app_installs (app_id, tenant_id, installed_by, installed_at)
       VALUES ($1,$2,$3,NOW()) ON CONFLICT (app_id, tenant_id) DO NOTHING`,
      [req.params.id, tenantId, req.user.id]
    );
    await pool.query(
      `UPDATE hg_marketplace_apps SET install_count = install_count + 1 WHERE id = $1`,
      [req.params.id]
    );
    await publishEvent({
      eventType: 'MarketplaceAppInstalled', resourceId: req.params.id,
      source: 'marketplace', payload: { tenantId, appId: req.params.id },
    });
    res.json({ success: true, message: 'App installed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Install failed' });
  }
});

router.delete('/apps/:id/install', authUser, requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `DELETE FROM hg_app_installs WHERE app_id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Uninstall failed' });
  }
});

router.post('/apps/:id/rate', authUser, async (req, res) => {
  try {
    const { rating, reviewText } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ success: false, message: 'rating 1–5 required' });
    const pool = await connectPostgres();
    await pool.query(
      `INSERT INTO hg_app_ratings (app_id, user_id, rating, review_text, created_at)
       VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (app_id, user_id) DO UPDATE
       SET rating = $3, review_text = $4, created_at = NOW()`,
      [req.params.id, req.user.id, rating, reviewText || null]
    );
    // Recompute avg
    await pool.query(
      `UPDATE hg_marketplace_apps
       SET avg_rating = (SELECT AVG(rating) FROM hg_app_ratings WHERE app_id = $1)
       WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Rating failed' });
  }
});

// ─── Network participants ─────────────────────────────────────────────────────
router.post('/network/participants', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const { name, participantType, city, state, country, contactEmail, capabilities } = req.body;
    if (!name || !participantType)
      return res.status(400).json({ success: false, message: 'name and participantType required' });
    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_network_participants
         (name, participant_type, city, state, country, contact_email, capabilities, active, joined_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW())
       RETURNING id, name, participant_type, city, joined_at`,
      [name, participantType, city || null, state || null, country || 'IN',
       contactEmail || null, JSON.stringify(capabilities || [])]
    );
    res.status(201).json({ success: true, participant: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to register participant' });
  }
});

router.get('/network/participants', authUser, async (req, res) => {
  try {
    const { type, city } = req.query;
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT id, name, participant_type, city, state, country, capabilities, joined_at
       FROM hg_network_participants
       WHERE active = TRUE
         AND ($1::text IS NULL OR participant_type = $1)
         AND ($2::text IS NULL OR city ILIKE '%' || $2 || '%')
       ORDER BY joined_at DESC LIMIT 200`,
      [type || null, city || null]
    );
    res.json({ success: true, participants: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list participants' });
  }
});

router.get('/network/stats', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM hg_network_participants WHERE active=TRUE) AS participants,
         (SELECT COUNT(*) FROM hg_marketplace_apps  WHERE review_status='approved') AS apps,
         (SELECT COUNT(*) FROM hg_app_installs) AS total_installs,
         (SELECT COUNT(*) FROM hg_edge_gateways WHERE status='online') AS online_gateways,
         (SELECT COUNT(*) FROM hg_digital_twins) AS digital_twins`
    );
    res.json({ success: true, stats: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get network stats' });
  }
});

// ─── Benchmarks ───────────────────────────────────────────────────────────────
router.post('/benchmarks', authUser, async (req, res) => {
  try {
    const { metricType, metricValue, unit, facilityType, specialty, region } = req.body;
    if (!metricType || metricValue === undefined)
      return res.status(400).json({ success: false, message: 'metricType and metricValue required' });
    const pool = await connectPostgres();
    await pool.query(
      `INSERT INTO hg_benchmarks
         (metric_type, metric_value, unit, facility_type, specialty, region, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [metricType, metricValue, unit || null, facilityType || null, specialty || null, region || null]
    );
    res.status(201).json({ success: true, message: 'Benchmark submitted. Thank you.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to submit benchmark' });
  }
});

router.get('/benchmarks', authUser, async (req, res) => {
  try {
    const { metricType, facilityType, specialty } = req.query;
    if (!metricType)
      return res.status(400).json({ success: false, message: 'metricType required' });
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT
         metric_type, unit, facility_type, specialty,
         ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) AS p25,
         ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) AS p50,
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) AS p75,
         ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) AS p90,
         COUNT(*) AS sample_size
       FROM hg_benchmarks
       WHERE metric_type = $1
         AND ($2::text IS NULL OR facility_type = $2)
         AND ($3::text IS NULL OR specialty      = $3)
       GROUP BY metric_type, unit, facility_type, specialty`,
      [metricType, facilityType || null, specialty || null]
    );
    res.json({ success: true, benchmarks: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get benchmarks' });
  }
});

// ─── Developer portal ─────────────────────────────────────────────────────────
router.get('/developer/stats', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM hg_marketplace_apps WHERE submitted_by = $1) AS apps_submitted,
         (SELECT COUNT(*) FROM hg_marketplace_apps WHERE submitted_by = $1
            AND review_status = 'approved')                                  AS apps_approved,
         (SELECT COALESCE(SUM(install_count),0) FROM hg_marketplace_apps
            WHERE submitted_by = $1)                                          AS total_installs,
         (SELECT COALESCE(AVG(avg_rating),0) FROM hg_marketplace_apps
            WHERE submitted_by = $1 AND avg_rating IS NOT NULL)               AS avg_rating`,
      [req.user.id]
    );
    res.json({ success: true, stats: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get developer stats' });
  }
});

export default router;
