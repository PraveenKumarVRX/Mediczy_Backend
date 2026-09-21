/**
 * Procurement API — unified on SCM tables (scm_vendors, scm_purchase_orders, scm_inventory_ledger).
 * Legacy procurement_* tables are no longer written to.
 */
import express from 'express';
import { safeRouter } from '../../utils/safeRouter.js';
import jwt from 'jsonwebtoken';
import { loginProcurement } from '../../controllers/dept/procurement.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import {
  getScopedScmDb,
  resolveItemId,
  poStatusAfterReceipt,
  scmOverviewMetrics,
} from '../../services/scm-unified.service.js';
import { ensureOperationsGovernanceTables } from '../../services/operations-governance.service.js';
import {
  actorFrom,
  decideOperationsApproval,
  listOperationsApprovals,
  listOperationsAudit,
  recordOperationsAudit,
  requestOperationsApproval,
} from '../../services/operations-governance.service.js';

const router = safeRouter(express.Router());

const authProcurement = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Procurement token required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_CONFIG.SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid procurement token' });
  }
  // Tenant isolation (WP-0.5): bound to the hospital in the token; a token without one is refused.
  const org = Number(decoded.organization_id);
  if (!Number.isInteger(org) || org <= 0) {
    return res.status(403).json({ success: false, code: 'ORG_REQUIRED', message: 'This login is not attached to a hospital. Sign in again, or ask an administrator to attach the account.' });
  }
  req.procurementUser = decoded;
  req.procurementOrgId = org;
  next();
};

const ensureTables = async (req, res) => {
  const db = await getScopedScmDb(req.procurementOrgId);
  res.once('close', () => { db.release(); });
  await ensureOperationsGovernanceTables(db);
  return db;
};

const actor = (req, fallback = 'Procurement') => actorFrom(req.procurementUser, fallback);

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginProcurement);

router.get('/overview', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const metrics = await scmOverviewMetrics(db);
  res.json({
    success: true,
    data: {
      open_orders: metrics.open_orders,
      awaiting_receipt: metrics.awaiting_receipt,
      approved_vendors: metrics.approved_vendors,
      todays_grns: metrics.todays_grns,
    },
  });
});

router.get('/vendors', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { rows } = await db.query('SELECT * FROM scm_vendors ORDER BY name ASC');
  res.json({ success: true, data: rows });
});

router.post('/vendors', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { vendorCode, name, category, contactName, phone } = req.body;
  if (!vendorCode || !name) return res.status(400).json({ success: false, message: 'vendorCode and name are required' });
  const { rows } = await db.query(`
    INSERT INTO scm_vendors (vendor_code, name, category, contact_name, phone)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [vendorCode, name, category || null, contactName || null, phone || null]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/orders', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { rows } = await db.query(`
    SELECT o.*, v.name AS vendor_name,
      COALESCE(json_agg(json_build_object(
        'id', l.id, 'itemId', l.item_id, 'itemCode', i.item_code,
        'description', l.description, 'quantity', l.quantity,
        'unitPrice', l.unit_price, 'receivedQuantity', l.received_quantity
      )) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
    FROM scm_purchase_orders o
    LEFT JOIN scm_vendors v ON v.id = o.vendor_id
    LEFT JOIN scm_po_lines l ON l.order_id = o.id
    LEFT JOIN scm_items i ON i.id = l.item_id
    GROUP BY o.id, v.name ORDER BY o.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.get('/orders/receivable', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { rows } = await db.query(`
    SELECT o.*, v.name AS vendor_name FROM scm_purchase_orders o
    LEFT JOIN scm_vendors v ON v.id = o.vendor_id
    WHERE o.status IN ('approved', 'partial_receipt') ORDER BY o.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.post('/orders', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { vendorId, department, requestedBy, requiredBy, lines = [] } = req.body;
  if (!vendorId || !lines.length) return res.status(400).json({ success: false, message: 'vendorId and lines are required' });
  const resolvedLines = [];
  for (const line of lines) {
    const itemId = await resolveItemId(db, line);
    if (!itemId) return res.status(400).json({ success: false, message: 'Each line needs itemId, itemCode, or description' });
    resolvedLines.push({ ...line, itemId });
  }
  const total = resolvedLines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const { rows } = await db.query(`
    INSERT INTO scm_purchase_orders (po_number, vendor_id, department, requested_by, total_amount, required_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [`PO-${Date.now()}`, vendorId, department || null, requestedBy || null, total, requiredBy || null]);
  for (const line of resolvedLines) {
    await db.query(
      'INSERT INTO scm_po_lines (order_id, item_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)',
      [rows[0].id, line.itemId, line.description || 'Item', line.quantity, line.unitPrice]
    );
  }
  const who = actor(req, requestedBy || 'Procurement');
  await requestOperationsApproval(db, { module: 'procurement', entityType: 'order', entityId: rows[0].id, action: 'approve_order', requestedBy: who });
  await recordOperationsAudit(db, { module: 'procurement', entityType: 'order', entityId: rows[0].id, action: 'order_created', actor: who, details: { total, lineCount: lines.length } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/orders/:id/approve', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const who = actor(req, 'Procurement Approver');
  const { rows: approvals } = await db.query(`
    SELECT id FROM operations_approvals
    WHERE module='procurement' AND entity_type='order' AND entity_id=$1 AND action='approve_order' AND status='pending'
  `, [req.params.id]);
  if (approvals[0]) await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: who });
  const { rows } = await db.query(`UPDATE scm_purchase_orders SET status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
  await recordOperationsAudit(db, { module: 'procurement', entityType: 'order', entityId: rows[0].id, action: 'order_approved', actor: who });
  res.json({ success: true, data: rows[0] });
});

router.post('/orders/:id/grn', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { receivedBy, notes, lines = [] } = req.body;
  const { rows: orders } = await db.query('SELECT * FROM scm_purchase_orders WHERE id = $1', [req.params.id]);
  if (!orders[0]) return res.status(404).json({ success: false, message: 'Order not found' });
  if (!['approved', 'partial_receipt'].includes(orders[0].status)) {
    return res.status(409).json({ success: false, message: `PO status ${orders[0].status} is not receivable` });
  }
  const { rows } = await db.query(
    'INSERT INTO scm_grns (grn_number, order_id, received_by, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [`GRN-${Date.now()}`, req.params.id, receivedBy || null, notes || null]
  );
  for (const line of lines) {
    await db.query('UPDATE scm_po_lines SET received_quantity = LEAST(quantity, received_quantity + $2) WHERE id = $1', [line.lineId, line.receivedQuantity]);
    const { rows: pl } = await db.query('SELECT item_id FROM scm_po_lines WHERE id = $1', [line.lineId]);
    await db.query(
      'INSERT INTO scm_grn_lines (grn_id, po_line_id, item_id, quantity) VALUES ($1,$2,$3,$4)',
      [rows[0].id, line.lineId, pl[0]?.item_id || line.itemId, line.receivedQuantity]
    );
  }
  const nextStatus = await poStatusAfterReceipt(db, orders[0].id);
  await db.query('UPDATE scm_purchase_orders SET status = $2, updated_at = NOW() WHERE id = $1', [orders[0].id, nextStatus]);
  const who = actor(req, receivedBy || 'Stores');
  await requestOperationsApproval(db, { module: 'stores', entityType: 'grn', entityId: rows[0].id, action: 'post_to_ledger', requestedBy: who });
  await recordOperationsAudit(db, { module: 'stores', entityType: 'grn', entityId: rows[0].id, action: 'grn_created', actor: who });
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/grns/:id/approve', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const who = actor(req, 'Stores Approver');
  const { rows: grns } = await db.query('SELECT * FROM scm_grns WHERE id = $1', [req.params.id]);
  if (!grns[0]) return res.status(404).json({ success: false, message: 'GRN not found' });
  const { rows: approvals } = await db.query(`
    SELECT id FROM operations_approvals
    WHERE module='stores' AND entity_type='grn' AND entity_id=$1 AND action='post_to_ledger' AND status='pending'
  `, [req.params.id]);
  if (approvals[0]) await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: who });
  const { rows: existing } = await db.query(
    `SELECT 1 FROM scm_inventory_ledger WHERE reference_type = 'grn' AND reference_id = $1 LIMIT 1`, [grns[0].id]
  );
  if (!existing.length) {
    const { rows: glines } = await db.query('SELECT * FROM scm_grn_lines WHERE grn_id = $1', [grns[0].id]);
    for (const line of glines) {
      await db.query(
        `INSERT INTO scm_inventory_ledger (item_id, txn_type, quantity_delta, unit_cost, reference_type, reference_id)
         VALUES ($1,'grn_receipt',$2,$3,'grn',$4)`,
        [line.item_id, line.quantity, null, grns[0].id]
      );
    }
  }
  await recordOperationsAudit(db, { module: 'stores', entityType: 'grn', entityId: grns[0].id, action: 'ledger_posted', actor: who });
  res.json({ success: true, data: grns[0] });
});

router.get('/approvals', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const approvals = await listOperationsApprovals(db, null);
  res.json({ success: true, data: approvals.filter((i) => ['procurement', 'stores', 'scm'].includes(i.module)) });
});

router.get('/audit', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const [p, s, scm] = await Promise.all([
    listOperationsAudit(db, 'procurement', 50),
    listOperationsAudit(db, 'stores', 50),
    listOperationsAudit(db, 'scm', 50),
  ]);
  res.json({ success: true, data: [...p, ...s, ...scm].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100) });
});

router.get('/stores/ledger', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { rows } = await db.query(`
    SELECT l.*, i.item_code, i.name AS description
    FROM scm_inventory_ledger l
    LEFT JOIN scm_items i ON i.id = l.item_id
    ORDER BY l.created_at DESC LIMIT 200
  `);
  res.json({ success: true, data: rows });
});

router.get('/stores/balances', authProcurement, async (req, res) => {
  const db = await ensureTables(req, res);
  const { rows } = await db.query(`
    SELECT i.item_code, i.name AS description, COALESCE(SUM(l.quantity_delta),0)::numeric AS quantity_on_hand
    FROM scm_items i
    LEFT JOIN scm_inventory_ledger l ON l.item_id = i.id
    GROUP BY i.item_code, i.name ORDER BY i.name
  `);
  res.json({ success: true, data: rows });
});

export default router;
