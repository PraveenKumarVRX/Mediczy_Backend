import express from 'express';
import jwt from 'jsonwebtoken';
import { loginScm } from '../controllers/dept/scm.controller.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { connectPostgres } from '../db/postgres.js';
import { ensureAllScmTables } from '../migrations/scm-tables.migration.js';
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
  const db = await connectPostgres();
  await ensureAllScmTables(db);
  await ensureOperationsGovernanceTables(db);
  return db;
};

const actor = (req, fallback = 'SCM') => actorFrom(req.scmUser, fallback);

const poStatusAfterReceipt = async (db, orderId) => {
  const { rows: lines } = await db.query(
    'SELECT quantity, received_quantity FROM scm_po_lines WHERE order_id = $1',
    [orderId]
  );
  if (!lines.length) return 'approved';
  const fullyReceived = lines.every((l) => Number(l.received_quantity) >= Number(l.quantity));
  const anyReceived = lines.some((l) => Number(l.received_quantity) > 0);
  if (fullyReceived) return 'received';
  if (anyReceived) return 'partial_receipt';
  return 'approved';
};

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginScm);

// ─── Overview ────────────────────────────────────────────────────────────────

router.get('/overview', authScm, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM scm_items WHERE status = 'active') AS active_items,
      (SELECT COUNT(*)::int FROM scm_purchase_orders WHERE status IN ('draft','submitted','approved','partial_receipt')) AS open_pos,
      (SELECT COUNT(*)::int FROM scm_ap_invoices WHERE status IN ('draft','matched','approved')) AS open_invoices,
      (SELECT COUNT(*)::int FROM scm_indents WHERE status IN ('submitted','approved')) AS open_indents,
      (SELECT COUNT(*)::int FROM scm_case_carts WHERE status IN ('preparing','ready')) AS active_case_carts,
      (SELECT COUNT(*)::int FROM scm_cycle_counts WHERE status = 'scheduled') AS scheduled_counts
  `);
  res.json({ success: true, data: rows[0] });
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
  const nextStatus = await poStatusAfterReceipt(db, order.id);
  await db.query('UPDATE scm_purchase_orders SET status = $2, updated_at = NOW() WHERE id = $1', [order.id, nextStatus]);
  await requestOperationsApproval(db, { module: 'scm', entityType: 'grn', entityId: rows[0].id, action: 'post_grn', requestedBy: actor(req, receivedBy || 'Stores') });
  res.status(201).json({ success: true, data: { ...rows[0], orderStatus: nextStatus } });
});

router.patch('/grns/:id/post', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows: grns } = await db.query('SELECT * FROM scm_grns WHERE id = $1', [req.params.id]);
  if (!grns[0]) return res.status(404).json({ success: false, message: 'GRN not found' });
  const { rows: lines } = await db.query('SELECT * FROM scm_grn_lines WHERE grn_id = $1', [grns[0].id]);
  for (const line of lines) {
    await db.query(
      'INSERT INTO scm_inventory_ledger (item_id, txn_type, quantity_delta, unit_cost, reference_type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [line.item_id, 'grn_receipt', line.quantity, null, 'grn', grns[0].id]
    );
  }
  await recordOperationsAudit(db, { module: 'scm', entityType: 'grn', entityId: grns[0].id, action: 'grn_posted', actor: actor(req), details: { lineCount: lines.length } });
  res.json({ success: true, data: grns[0] });
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

router.post('/ap/invoices/:id/match', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows: invoices } = await db.query('SELECT * FROM scm_ap_invoices WHERE id = $1', [req.params.id]);
  const invoice = invoices[0];
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  let matchStatus = 'unmatched';
  if (invoice.po_id && invoice.grn_id) {
    const { rows: po } = await db.query('SELECT total_amount FROM scm_purchase_orders WHERE id = $1', [invoice.po_id]);
    const poTotal = Number(po[0]?.total_amount || 0);
    const invoiceTotal = Number(invoice.amount) + Number(invoice.tax_amount || 0);
    matchStatus = Math.abs(poTotal - invoiceTotal) < 0.01 ? 'matched' : 'variance';
  }
  const { rows } = await db.query(
    'UPDATE scm_ap_invoices SET match_status = $2, status = CASE WHEN $2 = \'matched\' THEN \'matched\' ELSE status END WHERE id = $1 RETURNING *',
    [req.params.id, matchStatus]
  );
  res.json({ success: true, data: rows[0] });
});

router.patch('/ap/invoices/:id/approve', authScm, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`UPDATE scm_ap_invoices SET status = 'approved' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.json({ success: true, data: rows[0] });
});

router.post('/ap/invoices/:id/pay', authScm, async (req, res) => {
  const db = await ensureTables();
  const { amount, paymentMethod, paymentRef } = req.body;
  const { rows: invoices } = await db.query('SELECT * FROM scm_ap_invoices WHERE id = $1', [req.params.id]);
  if (!invoices[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });
  const payAmount = amount ?? invoices[0].amount;
  const { rows } = await db.query(
    'INSERT INTO scm_ap_payments (invoice_id, amount, payment_method, payment_ref) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, payAmount, paymentMethod || 'neft', paymentRef || null]
  );
  await db.query(`UPDATE scm_ap_invoices SET status = 'paid' WHERE id = $1`, [req.params.id]);
  res.status(201).json({ success: true, data: rows[0] });
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

router.post('/charge-captures', authScm, async (req, res) => {
  const db = await ensureTables();
  const { patientId, encounterId, itemId, quantity, unitPrice, costCenterId, sourceType, sourceId } = req.body;
  if (!itemId) return res.status(400).json({ success: false, message: 'itemId is required' });
  const { rows } = await db.query(`
    INSERT INTO scm_charge_captures (patient_id, encounter_id, item_id, quantity, unit_price, cost_center_id, source_type, source_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [patientId || null, encounterId || null, itemId, quantity || 1, unitPrice || null, costCenterId || null, sourceType || null, sourceId || null]);
  res.status(201).json({ success: true, data: rows[0] });
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

export default router;
