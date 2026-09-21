import express from 'express';
import jwt from 'jsonwebtoken';
import { loginScm } from '../controllers/dept/scm.controller.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { getScmDb, poStatusAfterReceipt as unifiedPoStatus, scmOverviewMetrics } from '../services/scm-unified.service.js';
import { scmRbacGuard } from '../middleware/scm-rbac.middleware.js';
import {
  actorFrom,
  decideOperationsApproval,
  ensureOperationsGovernanceTables,
  listOperationsApprovals,
  listOperationsAudit,
  recordOperationsAudit,
  requestOperationsApproval,
} from '../services/operations-governance.service.js';

const router = express.Router();

const authScm = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'SCM token required' });
  try {
    req.scmUser = jwt.verify(token, JWT_CONFIG.SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid SCM token' });
  }
};

const ensureTables = async () => {
  const db = await getScmDb();
  await ensureOperationsGovernanceTables(db);
  return db;
};

const actor = (req, fallback = 'SCM') => actorFrom(req.scmUser, fallback);

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginScm);

// ─── Overview ────────────────────────────────────────────────────────────────

router.get('/overview', authScm, scmRbacGuard, async (_req, res) => {
  const db = await ensureTables();
  const data = await scmOverviewMetrics(db);
  res.json({ success: true, data });
});

// ─── Item master & inventory ─────────────────────────────────────────────────

router.get('/items', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_items ORDER BY name ASC');
  res.json({ success: true, data: rows });
});

router.post('/items', authScm, async (req, res) => {
  const db = await ensureTables();
  const { itemCode, name, category, uom, hsnCode, gstRate, reorderLevel, criticality, isControlled } = req.body;
  if (!itemCode || !name) return res.status(400).json({ success: false, message: 'itemCode and name are required' });
  const { rows } = await db.query(`
    INSERT INTO scm_items (item_code, name, category, uom, hsn_code, gst_rate, reorder_level, criticality, is_controlled)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [itemCode, name, category || null, uom || 'EA', hsnCode || null, gstRate || 0, reorderLevel || 0, criticality || 'B', Boolean(isControlled)]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/inventory/balances', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT i.id AS item_id, i.item_code, i.name, w.code AS warehouse_code,
           COALESCE(SUM(l.quantity_delta), 0)::numeric AS quantity_on_hand
    FROM scm_items i
    LEFT JOIN scm_inventory_ledger l ON l.item_id = i.id
    LEFT JOIN scm_warehouses w ON w.id = l.warehouse_id
    GROUP BY i.id, i.item_code, i.name, w.code
    ORDER BY i.name
  `);
  res.json({ success: true, data: rows });
});

router.get('/warehouses', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_warehouses ORDER BY name');
  res.json({ success: true, data: rows });
});

router.post('/warehouses', authScm, async (req, res) => {
  const db = await ensureTables();
  const { code, name, storeType } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, message: 'code and name are required' });
  const { rows } = await db.query(
    'INSERT INTO scm_warehouses (code, name, store_type) VALUES ($1,$2,$3) RETURNING *',
    [code, name, storeType || 'central']
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ─── Indents ─────────────────────────────────────────────────────────────────

router.get('/indents', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT i.*,
      COALESCE(json_agg(json_build_object('id', l.id, 'itemId', l.item_id, 'quantity', l.quantity, 'issuedQuantity', l.issued_quantity))
        FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
    FROM scm_indents i
    LEFT JOIN scm_indent_lines l ON l.indent_id = i.id
    GROUP BY i.id ORDER BY i.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.post('/indents', authScm, async (req, res) => {
  const db = await ensureTables();
  const { department, requestedBy, priority, requiredBy, lines = [] } = req.body;
  if (!department || !lines.length) return res.status(400).json({ success: false, message: 'department and lines are required' });
  const missing = lines.filter((l) => !l.itemId);
  if (missing.length) return res.status(400).json({ success: false, message: 'All indent lines require itemId' });
  const { rows } = await db.query(`
    INSERT INTO scm_indents (indent_number, department, requested_by, priority, required_by, status)
    VALUES ($1,$2,$3,$4,$5,'submitted') RETURNING *
  `, [`IND-${Date.now()}`, department, requestedBy || null, priority || 'routine', requiredBy || null]);
  for (const line of lines) {
    await db.query('INSERT INTO scm_indent_lines (indent_id, item_id, quantity) VALUES ($1,$2,$3)', [rows[0].id, line.itemId, line.quantity]);
  }
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/indents/:id/approve', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(
    `UPDATE scm_indents SET status = 'approved' WHERE id = $1 AND status = 'submitted' RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Indent not found or not submittable' });
  await recordOperationsAudit(db, { module: 'scm', entityType: 'indent', entityId: rows[0].id, action: 'indent_approved', actor: actor(req) });
  res.json({ success: true, data: rows[0] });
});

router.post('/indents/:id/convert-to-po', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { vendorId } = req.body;
  if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId is required' });
  const { rows: indents } = await db.query('SELECT * FROM scm_indents WHERE id = $1', [req.params.id]);
  const indent = indents[0];
  if (!indent) return res.status(404).json({ success: false, message: 'Indent not found' });
  if (indent.status !== 'approved') return res.status(409).json({ success: false, message: 'Indent must be approved first' });
  if (indent.po_id) return res.status(409).json({ success: false, message: 'Indent already converted to PO', poId: indent.po_id });

  const { rows: lines } = await db.query(`
    SELECT l.*, i.name AS item_name, c.contract_price
    FROM scm_indent_lines l
    JOIN scm_items i ON i.id = l.item_id
    LEFT JOIN scm_vendor_catalogue c ON c.item_id = l.item_id AND c.vendor_id = $2
    WHERE l.indent_id = $1
  `, [indent.id, vendorId]);
  if (!lines.length) return res.status(400).json({ success: false, message: 'Indent has no lines' });

  const total = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.contract_price || 100), 0);
  const { rows: po } = await db.query(`
    INSERT INTO scm_purchase_orders (po_number, vendor_id, department, requested_by, total_amount, status)
    VALUES ($1,$2,$3,$4,$5,'submitted') RETURNING *
  `, [`PO-IND-${Date.now()}`, vendorId, indent.department, indent.requested_by, total]);
  for (const line of lines) {
    await db.query(
      'INSERT INTO scm_po_lines (order_id, item_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)',
      [po[0].id, line.item_id, line.item_name, line.quantity, line.contract_price || 100]
    );
  }
  await db.query('UPDATE scm_indents SET po_id = $2, status = $3 WHERE id = $1', [indent.id, po[0].id, 'converted']);
  await requestOperationsApproval(db, { module: 'scm', entityType: 'order', entityId: po[0].id, action: 'approve_po', requestedBy: actor(req) });
  await recordOperationsAudit(db, { module: 'scm', entityType: 'indent', entityId: indent.id, action: 'indent_converted_to_po', actor: actor(req), details: { poId: po[0].id } });
  res.status(201).json({ success: true, data: { indent: { ...indent, po_id: po[0].id }, purchaseOrder: po[0] } });
});

// ─── Vendors ─────────────────────────────────────────────────────────────────

router.get('/vendors', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_vendors ORDER BY name');
  res.json({ success: true, data: rows });
});

router.post('/vendors', authScm, async (req, res) => {
  const db = await ensureTables();
  const { vendorCode, name, category, gstin, contactName, phone, riskScore } = req.body;
  if (!vendorCode || !name) return res.status(400).json({ success: false, message: 'vendorCode and name are required' });
  const { rows } = await db.query(`
    INSERT INTO scm_vendors (vendor_code, name, category, gstin, contact_name, phone, risk_score)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [vendorCode, name, category || null, gstin || null, contactName || null, phone || null, riskScore ?? 50]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/vendors/:id/catalogue', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT c.*, i.item_code, i.name AS item_name
    FROM scm_vendor_catalogue c
    JOIN scm_items i ON i.id = c.item_id
    WHERE c.vendor_id = $1 ORDER BY i.name
  `, [req.params.id]);
  res.json({ success: true, data: rows });
});

router.post('/vendors/:id/catalogue', authScm, async (req, res) => {
  const db = await ensureTables();
  const { itemId, vendorSku, contractPrice, leadTimeDays } = req.body;
  if (!itemId) return res.status(400).json({ success: false, message: 'itemId is required' });
  const { rows } = await db.query(`
    INSERT INTO scm_vendor_catalogue (vendor_id, item_id, vendor_sku, contract_price, lead_time_days)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (vendor_id, item_id) DO UPDATE SET vendor_sku = EXCLUDED.vendor_sku, contract_price = EXCLUDED.contract_price, lead_time_days = EXCLUDED.lead_time_days
    RETURNING *
  `, [req.params.id, itemId, vendorSku || null, contractPrice || null, leadTimeDays || 7]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/vendors/:id/risk', authScm, async (req, res) => {
  const db = await ensureTables();
  const { riskScore } = req.body;
  const { rows } = await db.query('UPDATE scm_vendors SET risk_score = $2 WHERE id = $1 RETURNING *', [req.params.id, riskScore]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: rows[0] });
});

// ─── Purchase orders & GRN ─────────────────────────────────────────────────

router.get('/orders', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT o.*, v.name AS vendor_name,
      COALESCE(json_agg(json_build_object('id', l.id, 'itemId', l.item_id, 'description', l.description, 'quantity', l.quantity, 'unitPrice', l.unit_price, 'receivedQuantity', l.received_quantity))
        FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
    FROM scm_purchase_orders o
    LEFT JOIN scm_vendors v ON v.id = o.vendor_id
    LEFT JOIN scm_po_lines l ON l.order_id = o.id
    GROUP BY o.id, v.name ORDER BY o.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.get('/orders/receivable', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT o.*, v.name AS vendor_name
    FROM scm_purchase_orders o
    LEFT JOIN scm_vendors v ON v.id = o.vendor_id
    WHERE o.status IN ('approved', 'partial_receipt')
    ORDER BY o.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.post('/orders', authScm, async (req, res) => {
  const db = await ensureTables();
  const { vendorId, department, requestedBy, requiredBy, blanketOrderId, lines = [] } = req.body;
  if (!vendorId || !lines.length) return res.status(400).json({ success: false, message: 'vendorId and lines are required' });
  const missing = lines.filter((l) => !l.itemId);
  if (missing.length) return res.status(400).json({ success: false, message: 'All PO lines require itemId' });
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const { rows } = await db.query(`
    INSERT INTO scm_purchase_orders (po_number, vendor_id, department, requested_by, total_amount, required_by, blanket_order_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [`PO-${Date.now()}`, vendorId, department || null, requestedBy || null, total, requiredBy || null, blanketOrderId || null]);
  for (const line of lines) {
    await db.query(
      'INSERT INTO scm_po_lines (order_id, item_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)',
      [rows[0].id, line.itemId, line.description, line.quantity, line.unitPrice]
    );
  }
  await requestOperationsApproval(db, { module: 'scm', entityType: 'order', entityId: rows[0].id, action: 'approve_po', requestedBy: actor(req, requestedBy || 'SCM') });
  await recordOperationsAudit(db, { module: 'scm', entityType: 'order', entityId: rows[0].id, action: 'po_created', actor: actor(req), details: { total, lineCount: lines.length } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/orders/:id/approve', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows: approvals } = await db.query(`
    SELECT id FROM operations_approvals
    WHERE module='scm' AND entity_type='order' AND entity_id=$1 AND action='approve_po' AND status='pending'
    ORDER BY requested_at DESC LIMIT 1
  `, [req.params.id]);
  if (approvals[0]) {
    await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: actor(req) });
  }
  const { rows } = await db.query(`UPDATE scm_purchase_orders SET status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
  await recordOperationsAudit(db, { module: 'scm', entityType: 'order', entityId: rows[0].id, action: 'po_approved', actor: actor(req) });
  res.json({ success: true, data: rows[0] });
});

router.post('/orders/:id/grn', authScm, async (req, res) => {
  const db = await ensureTables();
  const { receivedBy, notes, lines = [] } = req.body;
  const { rows: orders } = await db.query('SELECT * FROM scm_purchase_orders WHERE id = $1', [req.params.id]);
  const order = orders[0];
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (!['approved', 'partial_receipt'].includes(order.status)) {
    return res.status(409).json({ success: false, message: `PO status ${order.status} is not receivable` });
  }
  const { rows } = await db.query(
    'INSERT INTO scm_grns (grn_number, order_id, received_by, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [`GRN-${Date.now()}`, req.params.id, receivedBy || null, notes || null]
  );
  for (const line of lines) {
    await db.query('UPDATE scm_po_lines SET received_quantity = LEAST(quantity, received_quantity + $2) WHERE id = $1', [line.lineId, line.receivedQuantity]);
    await db.query(
      'INSERT INTO scm_grn_lines (grn_id, po_line_id, item_id, quantity, batch_number, expiry_date) VALUES ($1,$2,$3,$4,$5,$6)',
      [rows[0].id, line.lineId, line.itemId || null, line.receivedQuantity, line.batchNumber || null, line.expiryDate || null]
    );
  }
  const nextStatus = await unifiedPoStatus(db, order.id);
  await db.query('UPDATE scm_purchase_orders SET status = $2, updated_at = NOW() WHERE id = $1', [order.id, nextStatus]);
  await requestOperationsApproval(db, { module: 'scm', entityType: 'grn', entityId: rows[0].id, action: 'post_grn', requestedBy: actor(req, receivedBy || 'Stores') });
  res.status(201).json({ success: true, data: { ...rows[0], orderStatus: nextStatus } });
});

router.get('/grns', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT g.*, o.po_number, o.vendor_id, v.name AS vendor_name,
      EXISTS(SELECT 1 FROM scm_inventory_ledger l WHERE l.reference_type = 'grn' AND l.reference_id = g.id) AS posted
    FROM scm_grns g
    JOIN scm_purchase_orders o ON o.id = g.order_id
    LEFT JOIN scm_vendors v ON v.id = o.vendor_id
    ORDER BY g.created_at DESC
    LIMIT 100
  `);
  res.json({ success: true, data: rows });
});

router.patch('/grns/:id/post', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows: grns } = await db.query('SELECT * FROM scm_grns WHERE id = $1', [req.params.id]);
  if (!grns[0]) return res.status(404).json({ success: false, message: 'GRN not found' });
  const { rows: existing } = await db.query(
    `SELECT 1 FROM scm_inventory_ledger WHERE reference_type = 'grn' AND reference_id = $1 LIMIT 1`,
    [grns[0].id]
  );
  if (existing.length) return res.status(409).json({ success: false, message: 'GRN already posted to inventory' });
  const { rows: approvals } = await db.query(`
    SELECT id FROM operations_approvals
    WHERE module='scm' AND entity_type='grn' AND entity_id=$1 AND action='post_grn' AND status='pending'
    ORDER BY requested_at DESC LIMIT 1
  `, [req.params.id]);
  if (approvals[0]) {
    await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: actor(req) });
  }
  const { rows: lines } = await db.query('SELECT * FROM scm_grn_lines WHERE grn_id = $1', [grns[0].id]);
  for (const line of lines) {
    await db.query(
      'INSERT INTO scm_inventory_ledger (item_id, txn_type, quantity_delta, unit_cost, reference_type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [line.item_id, 'grn_receipt', line.quantity, null, 'grn', grns[0].id]
    );
  }
  await recordOperationsAudit(db, { module: 'scm', entityType: 'grn', entityId: grns[0].id, action: 'grn_posted', actor: actor(req), details: { lineCount: lines.length } });
  res.json({ success: true, data: { ...grns[0], posted: true, lineCount: lines.length } });
});

// ─── AP invoices & payments ──────────────────────────────────────────────────

router.get('/ap/invoices', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT i.*, v.name AS vendor_name FROM scm_ap_invoices i
    LEFT JOIN scm_vendors v ON v.id = i.vendor_id ORDER BY i.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.post('/ap/invoices', authScm, async (req, res) => {
  const db = await ensureTables();
  const { invoiceNumber, vendorId, poId, grnId, invoiceDate, amount, taxAmount } = req.body;
  if (!invoiceNumber || !vendorId || amount == null) return res.status(400).json({ success: false, message: 'invoiceNumber, vendorId, and amount are required' });
  const { rows } = await db.query(`
    INSERT INTO scm_ap_invoices (invoice_number, vendor_id, po_id, grn_id, invoice_date, amount, tax_amount)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [invoiceNumber, vendorId, poId || null, grnId || null, invoiceDate || null, amount, taxAmount || 0]);
  res.status(201).json({ success: true, data: rows[0] });
});

// Extended to a real 3-way match 2026-09-18 (previously PO-vs-invoice only,
// ignoring the GRN even though invoice.grn_id was already a precondition —
// per the audit finding that "vendor bill reconciliation is a 2-way match,
// not a full 3-way line-level reconciliation"). Now compares PO total,
// GRN-derived received value, and invoice total; reports which leg
// disagrees rather than a single opaque "variance".
router.post('/ap/invoices/:id/match', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows: invoices } = await db.query('SELECT * FROM scm_ap_invoices WHERE id = $1', [req.params.id]);
  const invoice = invoices[0];
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  let matchStatus = 'unmatched';
  let matchDetail = null;
  const TOLERANCE = 0.01;

  if (invoice.po_id && invoice.grn_id) {
    const { rows: po } = await db.query('SELECT total_amount FROM scm_purchase_orders WHERE id = $1', [invoice.po_id]);
    const poTotal = Number(po[0]?.total_amount || 0);
    // PO totals and GRN values are net of tax (qty x unit_price); the invoice
    // stores tax separately, so the match is done on the net amount.
    const invoiceNet = Number(invoice.amount);
    const invoiceTax = Number(invoice.tax_amount || 0);

    const { rows: grnValueRows } = await db.query(
      `SELECT COALESCE(SUM(gl.quantity * pl.unit_price), 0) AS received_value
       FROM scm_grn_lines gl
       JOIN scm_po_lines pl ON pl.id = gl.po_line_id
       WHERE gl.grn_id = $1`,
      [invoice.grn_id]
    );
    const grnValue = Number(grnValueRows[0]?.received_value || 0);

    // Partial receipts are normal: the vendor bills what was received on this
    // GRN, which can be less than the PO. So:
    //  - invoice must equal what this GRN received (billed == received)
    //  - invoice must not exceed the PO (not billed more than ordered)
    //  - this GRN must not exceed the PO (not received more than ordered)
    const grnVsInvoice = Math.abs(grnValue - invoiceNet) < TOLERANCE;
    const poVsInvoice = invoiceNet <= poTotal + TOLERANCE;
    const poVsGrn = grnValue <= poTotal + TOLERANCE;

    matchStatus = (poVsInvoice && grnVsInvoice && poVsGrn) ? 'matched' : 'variance';
    matchDetail = {
      poTotal, grnReceivedValue: grnValue, invoiceTotal: invoiceNet, invoiceTax, invoiceGross: invoiceNet + invoiceTax,
      poVsInvoiceMatch: poVsInvoice, grnVsInvoiceMatch: grnVsInvoice, poVsGrnMatch: poVsGrn,
    };
  }

  const { rows } = await db.query(
    'UPDATE scm_ap_invoices SET match_status = $2::text, status = CASE WHEN $2::text = \'matched\' THEN \'matched\' ELSE status END WHERE id = $1 RETURNING *',
    [req.params.id, matchStatus]
  );
  res.json({ success: true, data: rows[0], matchDetail });
});

router.patch('/ap/invoices/:id/approve', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`UPDATE scm_ap_invoices SET status = 'approved' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.json({ success: true, data: rows[0] });
});

// Vendor payment: one transaction, invoice row locked, amount bounded by what is still outstanding,
// idempotent on (invoice, paymentRef) so a retry never pays twice, and partial payments keep the invoice open.
router.post('/ap/invoices/:id/pay', authScm, async (req, res) => {
  const invoiceId = /^\d{1,9}$/.test(String(req.params.id)) ? Number(req.params.id) : null;
  if (!invoiceId) return res.status(400).json({ success: false, message: 'Invalid invoice id' });
  const { amount, paymentMethod, paymentRef } = req.body || {};
  const db = await ensureTables();
  const client = await db.connect();
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  try {
    await client.query('BEGIN');
    const { rows: invoices } = await client.query('SELECT * FROM scm_ap_invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
    const invoice = invoices[0];
    if (!invoice) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Invoice not found' }); }

    const ref = paymentRef ? String(paymentRef).slice(0, 120) : null;
    if (ref) {
      const { rows: dup } = await client.query('SELECT * FROM scm_ap_payments WHERE invoice_id = $1 AND payment_ref = $2', [invoiceId, ref]);
      if (dup[0]) { await client.query('ROLLBACK'); return res.status(200).json({ success: true, duplicate: true, data: dup[0] }); }
    }
    if (!['approved', 'matched', 'partial'].includes(invoice.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Invoice is ${invoice.status}; it must be approved (or matched) before it can be paid` });
    }
    const { rows: paidRows } = await client.query(`SELECT COALESCE(SUM(amount), 0) AS s FROM scm_ap_payments WHERE invoice_id = $1 AND COALESCE(status, 'paid') NOT IN ('failed', 'reversed')`, [invoiceId]);
    const outstanding = round2(Number(invoice.amount) - Number(paidRows[0].s));
    const payAmount = amount === undefined || amount === null || amount === '' ? outstanding : round2(Number(amount));
    if (!Number.isFinite(payAmount) || payAmount <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero' }); }
    if (payAmount > outstanding + 0.005) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: `Payment exceeds the outstanding balance (${outstanding.toFixed(2)})` }); }

    const { rows } = await client.query(
      'INSERT INTO scm_ap_payments (invoice_id, amount, payment_method, payment_ref) VALUES ($1,$2,$3,$4) RETURNING *',
      [invoiceId, payAmount, paymentMethod || 'neft', ref]
    );
    const settled = round2(Number(paidRows[0].s) + payAmount) >= round2(Number(invoice.amount)) - 0.005;
    await client.query('UPDATE scm_ap_invoices SET status = $2 WHERE id = $1', [invoiceId, settled ? 'paid' : 'partial']);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0], invoiceStatus: settled ? 'paid' : 'partial', outstanding: round2(outstanding - payAmount) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') return res.status(200).json({ success: true, duplicate: true });
    console.error('[SCM] AP payment failed:', e.message);
    res.status(500).json({ success: false, message: 'Payment could not be recorded' });
  } finally {
    client.release();
  }
});

// ─── Cost centers ────────────────────────────────────────────────────────────

router.get('/cost-centers', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_cost_centers ORDER BY code');
  res.json({ success: true, data: rows });
});

router.post('/cost-centers', authScm, async (req, res) => {
  const db = await ensureTables();
  const { code, name, department, glCode } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, message: 'code and name are required' });
  const { rows } = await db.query(
    'INSERT INTO scm_cost_centers (code, name, department, gl_code) VALUES ($1,$2,$3,$4) RETURNING *',
    [code, name, department || null, glCode || null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ─── Clinical supply ─────────────────────────────────────────────────────────

router.get('/preference-cards', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_preference_cards ORDER BY procedure_name');
  res.json({ success: true, data: rows });
});

router.post('/preference-cards', authScm, async (req, res) => {
  const db = await ensureTables();
  const { procedureCode, procedureName, surgeonName, items = [] } = req.body;
  if (!procedureCode || !procedureName) return res.status(400).json({ success: false, message: 'procedureCode and procedureName are required' });
  const { rows } = await db.query(
    'INSERT INTO scm_preference_cards (procedure_code, procedure_name, surgeon_name) VALUES ($1,$2,$3) RETURNING *',
    [procedureCode, procedureName, surgeonName || null]
  );
  for (const item of items) {
    await db.query(
      'INSERT INTO scm_preference_card_items (card_id, item_id, default_quantity, is_implant) VALUES ($1,$2,$3,$4)',
      [rows[0].id, item.itemId, item.defaultQuantity || 1, Boolean(item.isImplant)]
    );
  }
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/case-carts', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_case_carts ORDER BY created_at DESC');
  res.json({ success: true, data: rows });
});

router.post('/case-carts', authScm, async (req, res) => {
  const db = await ensureTables();
  const { preferenceCardId, procedureCode, otRoom, scheduledAt, items = [] } = req.body;
  const { rows } = await db.query(`
    INSERT INTO scm_case_carts (cart_number, preference_card_id, procedure_code, ot_room, scheduled_at)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [`CART-${Date.now()}`, preferenceCardId || null, procedureCode || null, otRoom || null, scheduledAt || null]);
  for (const item of items) {
    await db.query(
      'INSERT INTO scm_case_cart_items (cart_id, item_id, planned_quantity) VALUES ($1,$2,$3)',
      [rows[0].id, item.itemId, item.plannedQuantity || 1]
    );
  }
  res.status(201).json({ success: true, data: rows[0] });
});

router.post('/charge-captures', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { patientId, encounterId, itemId, quantity, unitPrice, costCenterId, sourceType, sourceId } = req.body;
  if (!itemId) return res.status(400).json({ success: false, message: 'itemId is required' });
  const { rows } = await db.query(`
    INSERT INTO scm_charge_captures (patient_id, encounter_id, item_id, quantity, unit_price, cost_center_id, source_type, source_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [patientId || null, encounterId || null, itemId, quantity || 1, unitPrice || null, costCenterId || null, sourceType || null, sourceId || null]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/charge-captures', authScm, scmRbacGuard, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT c.*, i.name AS item_name, i.item_code
    FROM scm_charge_captures c
    LEFT JOIN scm_items i ON i.id = c.item_id
    ORDER BY c.created_at DESC LIMIT 100
  `);
  res.json({ success: true, data: rows });
});

router.post('/charge-captures/:id/bill', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { rows: caps } = await db.query('SELECT * FROM scm_charge_captures WHERE id = $1', [req.params.id]);
  const cap = caps[0];
  if (!cap) return res.status(404).json({ success: false, message: 'Charge capture not found' });
  if (cap.billed) return res.status(409).json({ success: false, message: 'Already billed' });
  const amount = Number(cap.quantity) * Number(cap.unit_price || 0);
  const orderNumber = `SCM-CHG-${Date.now()}`;
  await db.query(`
    INSERT INTO scm_billing_charges (charge_capture_id, billing_order_number, patient_id, encounter_id, amount, status)
    VALUES ($1,$2,$3,$4,$5,'posted')
  `, [cap.id, orderNumber, cap.patient_id, cap.encounter_id, amount]);
  const { rows } = await db.query('UPDATE scm_charge_captures SET billed = TRUE WHERE id = $1 RETURNING *', [cap.id]);
  await recordOperationsAudit(db, { module: 'scm', entityType: 'charge_capture', entityId: cap.id, action: 'charge_billed', actor: actor(req), details: { orderNumber, amount } });
  res.json({ success: true, data: { charge: rows[0], billingOrderNumber: orderNumber, amount } });
});

router.get('/formulary', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT f.*, i.item_code, i.name FROM scm_formulary f JOIN scm_items i ON i.id = f.item_id ORDER BY i.name
  `);
  res.json({ success: true, data: rows });
});

router.post('/formulary', authScm, async (req, res) => {
  const db = await ensureTables();
  const { itemId, tier, restrictionNotes } = req.body;
  if (!itemId) return res.status(400).json({ success: false, message: 'itemId is required' });
  const { rows } = await db.query(`
    INSERT INTO scm_formulary (item_id, tier, restriction_notes) VALUES ($1,$2,$3)
    ON CONFLICT (item_id) DO UPDATE SET tier = EXCLUDED.tier, restriction_notes = EXCLUDED.restriction_notes
    RETURNING *
  `, [itemId, tier || 'formulary', restrictionNotes || null]);
  res.status(201).json({ success: true, data: rows[0] });
});

// ─── Supplier ops ────────────────────────────────────────────────────────────

router.get('/asn', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_asn ORDER BY created_at DESC');
  res.json({ success: true, data: rows });
});

router.post('/asn', authScm, async (req, res) => {
  const db = await ensureTables();
  const { poId, vendorId, expectedAt, lines = [] } = req.body;
  const { rows } = await db.query(
    'INSERT INTO scm_asn (asn_number, po_id, vendor_id, expected_at) VALUES ($1,$2,$3,$4) RETURNING *',
    [`ASN-${Date.now()}`, poId || null, vendorId || null, expectedAt || null]
  );
  for (const line of lines) {
    await db.query('INSERT INTO scm_asn_lines (asn_id, item_id, quantity) VALUES ($1,$2,$3)', [rows[0].id, line.itemId, line.quantity]);
  }
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/blanket-orders', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_blanket_orders ORDER BY created_at DESC');
  res.json({ success: true, data: rows });
});

router.post('/blanket-orders', authScm, async (req, res) => {
  const db = await ensureTables();
  const { vendorId, maxAmount, validFrom, validTo } = req.body;
  if (!vendorId || maxAmount == null) return res.status(400).json({ success: false, message: 'vendorId and maxAmount are required' });
  const { rows } = await db.query(`
    INSERT INTO scm_blanket_orders (blanket_number, vendor_id, max_amount, valid_from, valid_to)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [`BLK-${Date.now()}`, vendorId, maxAmount, validFrom || null, validTo || null]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.post('/asn/ingest', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { documentType = '856', externalId, vendorCode, vendorId, poNumber, expectedAt, lines = [], rawPayload } = req.body;
  let vid = vendorId;
  if (!vid && vendorCode) {
    const { rows: v } = await db.query('SELECT id FROM scm_vendors WHERE vendor_code = $1', [vendorCode]);
    vid = v[0]?.id;
  }
  if (!vid) return res.status(400).json({ success: false, message: 'vendorId or vendorCode required' });

  let poId = null;
  if (poNumber) {
    const { rows: po } = await db.query('SELECT id FROM scm_purchase_orders WHERE po_number = $1', [poNumber]);
    poId = po[0]?.id || null;
  }

  const { rows: asn } = await db.query(
    'INSERT INTO scm_asn (asn_number, po_id, vendor_id, expected_at, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [`EDI-${externalId || Date.now()}`, poId, vid, expectedAt || null, 'in_transit']
  );
  for (const line of lines) {
    const itemId = line.itemId || (line.itemCode
      ? (await db.query('SELECT id FROM scm_items WHERE item_code = $1', [line.itemCode])).rows[0]?.id
      : null);
    if (itemId) await db.query('INSERT INTO scm_asn_lines (asn_id, item_id, quantity) VALUES ($1,$2,$3)', [asn[0].id, itemId, line.quantity]);
  }
  await db.query(`
    INSERT INTO scm_edi_ingest_log (source, document_type, external_id, vendor_id, payload, status, asn_id)
    VALUES ('edi',$1,$2,$3,$4,'processed',$5)
  `, [documentType, externalId || asn[0].asn_number, vid, JSON.stringify(rawPayload || req.body), asn[0].id]);
  await recordOperationsAudit(db, { module: 'scm', entityType: 'asn', entityId: asn[0].id, action: 'edi_asn_ingested', actor: actor(req) });
  res.status(201).json({ success: true, data: asn[0] });
});

// ─── Ops control ─────────────────────────────────────────────────────────────

router.get('/cycle-counts', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_cycle_counts ORDER BY scheduled_date DESC');
  res.json({ success: true, data: rows });
});

router.post('/cycle-counts', authScm, async (req, res) => {
  const db = await ensureTables();
  const { warehouseId, scheduledDate, lines = [] } = req.body;
  const { rows } = await db.query(
    'INSERT INTO scm_cycle_counts (count_number, warehouse_id, scheduled_date) VALUES ($1,$2,$3) RETURNING *',
    [`CC-${Date.now()}`, warehouseId || null, scheduledDate || null]
  );
  for (const line of lines) {
    await db.query(
      'INSERT INTO scm_cycle_count_lines (count_id, item_id, location_id, system_qty) VALUES ($1,$2,$3,$4)',
      [rows[0].id, line.itemId, line.locationId || null, line.systemQty || 0]
    );
  }
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/cycle-counts/:id/complete', authScm, async (req, res) => {
  const db = await ensureTables();
  const { countedBy, lines = [] } = req.body;
  for (const line of lines) {
    const variance = Number(line.countedQty) - Number(line.systemQty || 0);
    await db.query(
      'UPDATE scm_cycle_count_lines SET counted_qty = $2, variance = $3 WHERE id = $1',
      [line.lineId, line.countedQty, variance]
    );
    if (variance !== 0 && line.itemId) {
      await db.query(
        'INSERT INTO scm_inventory_ledger (item_id, txn_type, quantity_delta, reference_type, reference_id, notes) VALUES ($1,$2,$3,$4,$5,$6)',
        [line.itemId, 'cycle_count_adjustment', variance, 'cycle_count', req.params.id, 'Cycle count variance']
      );
    }
  }
  const { rows } = await db.query(
    `UPDATE scm_cycle_counts SET status = 'completed', counted_by = $2, completed_at = NOW() WHERE id = $1 RETURNING *`,
    [req.params.id, countedBy || null]
  );
  res.json({ success: true, data: rows[0] });
});

router.get('/cold-chain', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_cold_chain_logs ORDER BY recorded_at DESC LIMIT 200');
  res.json({ success: true, data: rows });
});

router.post('/cold-chain', authScm, async (req, res) => {
  const db = await ensureTables();
  const { itemId, warehouseId, batchNumber, temperatureC, recordedBy } = req.body;
  if (temperatureC == null) return res.status(400).json({ success: false, message: 'temperatureC is required' });
  const alertTriggered = Number(temperatureC) > 8 || Number(temperatureC) < 2;
  const { rows } = await db.query(`
    INSERT INTO scm_cold_chain_logs (item_id, warehouse_id, batch_number, temperature_c, recorded_by, alert_triggered)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [itemId || null, warehouseId || null, batchNumber || null, temperatureC, recordedBy || null, alertTriggered]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/controlled-substances', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM scm_controlled_substance_logs ORDER BY created_at DESC LIMIT 200');
  res.json({ success: true, data: rows });
});

router.post('/controlled-substances', authScm, async (req, res) => {
  const db = await ensureTables();
  const { itemId, txnType, quantity, witnessName, patientId, referenceType, referenceId, notes } = req.body;
  if (!itemId || !txnType || quantity == null) return res.status(400).json({ success: false, message: 'itemId, txnType, and quantity are required' });
  const { rows: bal } = await db.query(
    'SELECT COALESCE(SUM(quantity_delta),0)::numeric AS balance FROM scm_inventory_ledger WHERE item_id = $1',
    [itemId]
  );
  const balanceAfter = Number(bal[0]?.balance || 0) + Number(quantity);
  const { rows } = await db.query(`
    INSERT INTO scm_controlled_substance_logs (item_id, txn_type, quantity, balance_after, witness_name, patient_id, reference_type, reference_id, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [itemId, txnType, quantity, balanceAfter, witnessName || null, patientId || null, referenceType || null, referenceId || null, notes || null]);
  await db.query(
    'INSERT INTO scm_inventory_ledger (item_id, txn_type, quantity_delta, reference_type, reference_id, notes) VALUES ($1,$2,$3,$4,$5,$6)',
    [itemId, 'controlled_substance', quantity, 'controlled_log', rows[0].id, notes || null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ─── PAR locations, implant UDI traceability, spend analytics ────────────────

router.get('/locations', authScm, scmRbacGuard, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT loc.*, w.name AS warehouse_name, w.code AS warehouse_code
    FROM scm_locations loc
    JOIN scm_warehouses w ON w.id = loc.warehouse_id
    ORDER BY w.name, loc.code
  `);
  res.json({ success: true, data: rows });
});

router.post('/locations', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { warehouseId, code, zone, parLevel, maxLevel } = req.body;
  if (!warehouseId || !code) return res.status(400).json({ success: false, message: 'warehouseId and code required' });
  const { rows } = await db.query(
    'INSERT INTO scm_locations (warehouse_id, code, zone, par_level, max_level) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [warehouseId, code, zone || null, parLevel || 0, maxLevel || 0]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/locations/:id/par', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { parLevel, maxLevel } = req.body;
  const { rows } = await db.query(
    'UPDATE scm_locations SET par_level = COALESCE($2, par_level), max_level = COALESCE($3, max_level) WHERE id = $1 RETURNING *',
    [req.params.id, parLevel, maxLevel]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Location not found' });
  res.json({ success: true, data: rows[0] });
});

router.get('/implant-traces', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const { patientId } = req.query;
  const params = [];
  let where = '1=1';
  if (patientId) { where += ' AND patient_id = $1'; params.push(patientId); }
  const { rows } = await db.query(`
    SELECT t.*, i.item_code, i.name AS item_name
    FROM scm_implant_traces t
    LEFT JOIN scm_items i ON i.id = t.item_id
    WHERE ${where}
    ORDER BY t.created_at DESC LIMIT 100
  `, params);
  res.json({ success: true, data: rows });
});

router.post('/implant-traces', authScm, scmRbacGuard, async (req, res) => {
  const db = await ensureTables();
  const {
    itemId, patientId, encounterId, udiDi, udiPi, serialNumber, lotNumber,
    manufacturer, implantedAt, implantedBy, procedureCode,
  } = req.body;
  if (!patientId || (!udiDi && !serialNumber)) {
    return res.status(400).json({ success: false, message: 'patientId and udiDi or serialNumber required' });
  }
  const orgId = req.scmUser?.organization_id || null;
  const { rows } = await db.query(`
    INSERT INTO scm_implant_traces (
      item_id, patient_id, encounter_id, udi_di, udi_pi, serial_number, lot_number,
      manufacturer, implanted_at, implanted_by, procedure_code, organization_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
  `, [itemId || null, patientId, encounterId || null, udiDi || null, udiPi || null,
    serialNumber || null, lotNumber || null, manufacturer || null,
    implantedAt || new Date().toISOString(), implantedBy || actor(req), procedureCode || null, orgId]);
  await recordOperationsAudit(db, { module: 'scm', entityType: 'implant', entityId: rows[0].id, action: 'implant_traced', actor: actor(req), details: { patientId, udiDi } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/analytics/spend', authScm, scmRbacGuard, async (_req, res) => {
  const db = await ensureTables();
  const { rows: monthly } = await db.query(`
    SELECT to_char(created_at, 'YYYY-MM') AS month,
           COUNT(*)::int AS po_count,
           COALESCE(SUM(total_amount),0)::numeric AS spend
    FROM scm_purchase_orders
    WHERE created_at >= NOW() - INTERVAL '12 months'
    GROUP BY 1 ORDER BY 1
  `);
  const { rows: byVendor } = await db.query(`
    SELECT v.name AS vendor_name, COALESCE(SUM(o.total_amount),0)::numeric AS spend, COUNT(o.id)::int AS po_count
    FROM scm_purchase_orders o
    JOIN scm_vendors v ON v.id = o.vendor_id
    WHERE o.created_at >= NOW() - INTERVAL '6 months'
    GROUP BY v.name ORDER BY spend DESC LIMIT 10
  `);
  const { rows: byCategory } = await db.query(`
    SELECT i.category, COALESCE(SUM(l.quantity * l.unit_price),0)::numeric AS spend
    FROM scm_po_lines l
    JOIN scm_items i ON i.id = l.item_id
    JOIN scm_purchase_orders o ON o.id = l.order_id
    WHERE o.created_at >= NOW() - INTERVAL '6 months'
    GROUP BY i.category ORDER BY spend DESC
  `);
  res.json({ success: true, data: { monthly, byVendor, byCategory } });
});

router.post('/par-reorder/run', authScm, scmRbacGuard, async (req, res) => {
  const { runParReorderScan } = await import('../services/scm-par-reorder-cron.service.js');
  const result = await runParReorderScan({ autoCreatePo: Boolean(req.body?.autoCreatePo) });
  res.json({ success: true, data: result });
});

// ─── Governance ──────────────────────────────────────────────────────────────

router.get('/approvals', authScm, async (_req, res) => {
  const db = await ensureTables();
  const approvals = await listOperationsApprovals(db, null);
  res.json({ success: true, data: approvals.filter((item) => item.module === 'scm') });
});

router.get('/audit', authScm, async (_req, res) => {
  const db = await ensureTables();
  const audit = await listOperationsAudit(db, 'scm', 100);
  res.json({ success: true, data: audit });
});

// ─── AI-guided supply chain advisor (NOT SaMD — administrative SCM guidance) ─

router.post('/ai/chat', authScm, async (req, res) => {
  try {
    const { message, context = '', history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'message is required' });

    const db = await ensureTables();
    const { rows: overview } = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM scm_items WHERE status = 'active') AS active_items,
        (SELECT COUNT(*)::int FROM scm_purchase_orders WHERE status IN ('draft','submitted')) AS pending_pos,
        (SELECT COUNT(*)::int FROM scm_indents WHERE status = 'submitted') AS open_indents,
        (SELECT COUNT(*)::int FROM scm_ap_invoices WHERE status IN ('draft','matched')) AS open_invoices
    `);
    const metrics = overview[0] || {};

    const systemContext = `You are iSHA Supply Chain Advisor, an AI assistant for hospital SCM staff at Mediqzy. You help with:
- Purchase order workflow (indent → PO → approve → GRN → post to inventory → AP 3-way match)
- Vendor risk, cold-chain compliance (2–8°C), controlled substance witness rules
- OR preference cards, case carts, formulary tiers
- NABH/JCI inventory controls, FEFO, cycle counts
- Epic/Cerner-style best practices adapted for Indian hospitals

Live metrics: ${JSON.stringify(metrics)}. User context: ${context || 'SCM portal'}.
Be actionable, concise, and flag when physician/pharmacist sign-off is required. Do not make autonomous purchasing decisions.`;

    const messages = [
      { role: 'system', content: systemContext },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const result = await llmProvider.complete({ messages, maxTokens: 900, temperature: 0.4 });
    const reply = result?.content || result?.text || result?.message || String(result || '');

    res.json({ success: true, reply, advisor: 'iSHA Supply Chain', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[SCM AI] chat error:', err.message);
    res.status(500).json({ success: false, message: 'Supply chain advisor temporarily unavailable.' });
  }
});

router.post('/ai/reorder-advisor', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT i.id, i.item_code, i.name, i.reorder_level, i.criticality,
           COALESCE(SUM(l.quantity_delta), 0)::numeric AS on_hand
    FROM scm_items i
    LEFT JOIN scm_inventory_ledger l ON l.item_id = i.id
    WHERE i.status = 'active'
    GROUP BY i.id
    HAVING COALESCE(SUM(l.quantity_delta), 0) < i.reorder_level OR i.criticality = 'A'
    ORDER BY i.criticality, (COALESCE(SUM(l.quantity_delta), 0) - i.reorder_level) ASC
    LIMIT 25
  `);
  const recommendations = rows.map((r) => ({
    itemId: r.id,
    itemCode: r.item_code,
    name: r.name,
    onHand: Number(r.on_hand),
    reorderLevel: Number(r.reorder_level),
    criticality: r.criticality,
    suggestedQty: Math.max(Number(r.reorder_level) * 2 - Number(r.on_hand), Number(r.reorder_level)),
    priority: r.criticality === 'A' ? 'critical' : Number(r.on_hand) <= 0 ? 'stockout' : 'reorder',
  }));
  res.json({ success: true, data: recommendations, generatedAt: new Date().toISOString() });
});

export default router;
