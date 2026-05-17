import express from 'express';
import jwt from 'jsonwebtoken';
import { loginProcurement } from '../../controllers/dept/procurement.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { connectPostgres } from '../../db/postgres.js';
import {
  actorFrom,
  decideOperationsApproval,
  ensureOperationsGovernanceTables,
  listOperationsApprovals,
  listOperationsAudit,
  recordOperationsAudit,
  requestOperationsApproval,
} from '../../services/operations-governance.service.js';

const router = express.Router();

const authProcurement = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Procurement token required' });
  try {
    req.procurementUser = jwt.verify(token, JWT_CONFIG.SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid procurement token' });
  }
};

const ensureTables = async () => {
  const db = await connectPostgres();
  await db.query(`
    CREATE TABLE IF NOT EXISTS procurement_vendors (
      id SERIAL PRIMARY KEY,
      vendor_code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(120),
      contact_name VARCHAR(160),
      phone VARCHAR(40),
      status VARCHAR(40) NOT NULL DEFAULT 'approved',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procurement_orders (
      id SERIAL PRIMARY KEY,
      po_number VARCHAR(80) UNIQUE NOT NULL,
      vendor_id INTEGER REFERENCES procurement_vendors(id) ON DELETE SET NULL,
      department VARCHAR(120),
      requested_by VARCHAR(160),
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      required_by DATE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procurement_order_lines (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES procurement_orders(id) ON DELETE CASCADE,
      item_code VARCHAR(80),
      description VARCHAR(240) NOT NULL,
      quantity NUMERIC(12,2) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      received_quantity NUMERIC(12,2) NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS procurement_grns (
      id SERIAL PRIMARY KEY,
      grn_number VARCHAR(80) UNIQUE NOT NULL,
      order_id INTEGER REFERENCES procurement_orders(id) ON DELETE SET NULL,
      received_by VARCHAR(160),
      received_at TIMESTAMP NOT NULL DEFAULT NOW(),
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS central_store_ledger (
      id SERIAL PRIMARY KEY,
      item_code VARCHAR(80),
      description VARCHAR(240) NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id INTEGER,
      quantity_delta NUMERIC(12,2) NOT NULL,
      unit_price NUMERIC(12,2),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await ensureOperationsGovernanceTables(db);
  return db;
};

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginProcurement);

router.get('/overview', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM procurement_orders WHERE status IN ('draft','submitted','approved')) AS open_orders,
      (SELECT COUNT(*)::int FROM procurement_orders WHERE status = 'approved') AS awaiting_receipt,
      (SELECT COUNT(*)::int FROM procurement_vendors WHERE status = 'approved') AS approved_vendors,
      (SELECT COUNT(*)::int FROM procurement_grns WHERE received_at::date = CURRENT_DATE) AS todays_grns
  `);
  res.json({ success: true, data: rows[0] });
});

router.get('/vendors', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM procurement_vendors ORDER BY name ASC');
  res.json({ success: true, data: rows });
});

router.post('/vendors', authProcurement, async (req, res) => {
  const db = await ensureTables();
  const { vendorCode, name, category, contactName, phone } = req.body;
  if (!vendorCode || !name) return res.status(400).json({ success: false, message: 'vendorCode and name are required' });
  const { rows } = await db.query(`
    INSERT INTO procurement_vendors (vendor_code, name, category, contact_name, phone)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
  `, [vendorCode, name, category || null, contactName || null, phone || null]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/orders', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT o.*, v.name AS vendor_name,
      COALESCE(json_agg(json_build_object('id', l.id, 'itemCode', l.item_code, 'description', l.description, 'quantity', l.quantity, 'unitPrice', l.unit_price, 'receivedQuantity', l.received_quantity)) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
    FROM procurement_orders o
    LEFT JOIN procurement_vendors v ON v.id = o.vendor_id
    LEFT JOIN procurement_order_lines l ON l.order_id = o.id
    GROUP BY o.id, v.name
    ORDER BY o.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.post('/orders', authProcurement, async (req, res) => {
  const db = await ensureTables();
  const { vendorId, department, requestedBy, requiredBy, lines = [] } = req.body;
  if (!vendorId || !Array.isArray(lines) || !lines.length) return res.status(400).json({ success: false, message: 'vendorId and lines are required' });
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const { rows } = await db.query(`
    INSERT INTO procurement_orders (po_number, vendor_id, department, requested_by, total_amount, required_by)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
  `, [`PO-${Date.now()}`, vendorId, department || null, requestedBy || null, total, requiredBy || null]);
  for (const line of lines) {
    await db.query(`
      INSERT INTO procurement_order_lines (order_id, item_code, description, quantity, unit_price)
      VALUES ($1,$2,$3,$4,$5)
    `, [rows[0].id, line.itemCode || null, line.description, line.quantity, line.unitPrice]);
  }
  const actor = actorFrom(req.procurementUser, requestedBy || "Procurement");
  await requestOperationsApproval(db, { module: "procurement", entityType: "order", entityId: rows[0].id, action: "approve_order", requestedBy: actor });
  await recordOperationsAudit(db, { module: "procurement", entityType: "order", entityId: rows[0].id, action: "order_created", actor, details: { totalAmount: total, lineCount: lines.length } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/orders/:id/approve', authProcurement, async (req, res) => {
  const db = await ensureTables();
  const actor = actorFrom(req.procurementUser, 'Procurement Approver');
  const { rows: approvals } = await db.query(`
    SELECT * FROM operations_approvals
    WHERE module='procurement' AND entity_type='order' AND entity_id=$1 AND action='approve_order'
  `, [req.params.id]);
  if (approvals[0]?.status === 'pending') {
    await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: actor });
  }
  const { rows } = await db.query(`UPDATE procurement_orders SET status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
  await recordOperationsAudit(db, { module: 'procurement', entityType: 'order', entityId: rows[0].id, action: 'order_approved', actor });
  res.json({ success: true, data: rows[0] });
});

router.post('/orders/:id/grn', authProcurement, async (req, res) => {
  const db = await ensureTables();
  const { receivedBy, notes, lines = [] } = req.body;
  const { rows: orders } = await db.query('SELECT * FROM procurement_orders WHERE id = $1', [req.params.id]);
  if (!orders[0]) return res.status(404).json({ success: false, message: 'Order not found' });
  const { rows } = await db.query(`
    INSERT INTO procurement_grns (grn_number, order_id, received_by, notes)
    VALUES ($1,$2,$3,$4)
    RETURNING *
  `, [`GRN-${Date.now()}`, req.params.id, receivedBy || null, notes || null]);
  for (const line of lines) {
    await db.query(`UPDATE procurement_order_lines SET received_quantity = LEAST(quantity, received_quantity + $2) WHERE id = $1`, [line.lineId, line.receivedQuantity]);
  }
  const actor = actorFrom(req.procurementUser, receivedBy || 'Stores');
  await requestOperationsApproval(db, { module: 'stores', entityType: 'grn', entityId: rows[0].id, action: 'post_to_ledger', requestedBy: actor });
  await recordOperationsAudit(db, { module: 'stores', entityType: 'grn', entityId: rows[0].id, action: 'grn_created', actor, details: { orderId: Number(req.params.id), lineCount: lines.length } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/grns/:id/approve', authProcurement, async (req, res) => {
  const db = await ensureTables();
  const actor = actorFrom(req.procurementUser, 'Stores Approver');
  const { rows: grns } = await db.query('SELECT * FROM procurement_grns WHERE id = $1', [req.params.id]);
  if (!grns[0]) return res.status(404).json({ success: false, message: 'GRN not found' });
  const { rows: approvals } = await db.query(`SELECT * FROM operations_approvals WHERE module='stores' AND entity_type='grn' AND entity_id=$1 AND action='post_to_ledger'`, [req.params.id]);
  if (!approvals[0]) return res.status(409).json({ success: false, message: 'Store posting approval not requested' });
  if (approvals[0].status !== 'pending') return res.status(409).json({ success: false, message: `Store posting already ${approvals[0].status}` });
  const { rows: lines } = await db.query(`SELECT * FROM procurement_order_lines WHERE order_id = $1 AND received_quantity > 0`, [grns[0].order_id]);
  for (const line of lines) {
    await db.query(`INSERT INTO central_store_ledger (item_code, description, source_type, source_id, quantity_delta, unit_price) VALUES ($1,$2,'grn',$3,$4,$5)`, [line.item_code, line.description, grns[0].id, line.received_quantity, line.unit_price]);
  }
  await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: actor });
  await db.query(`UPDATE procurement_orders SET status = 'received', updated_at = NOW() WHERE id = $1`, [grns[0].order_id]);
  await recordOperationsAudit(db, { module: 'stores', entityType: 'grn', entityId: grns[0].id, action: 'ledger_posted', actor, details: { orderId: grns[0].order_id, lineCount: lines.length } });
  res.json({ success: true, data: grns[0] });
});

router.get('/approvals', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const approvals = await listOperationsApprovals(db, null);
  res.json({ success: true, data: approvals.filter((item) => ['procurement', 'stores'].includes(item.module)) });
});

router.get('/audit', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const [procurementAudit, storesAudit] = await Promise.all([listOperationsAudit(db, 'procurement', 50), listOperationsAudit(db, 'stores', 50)]);
  res.json({ success: true, data: [...procurementAudit, ...storesAudit].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100) });
});

router.get('/stores/ledger', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT * FROM central_store_ledger ORDER BY created_at DESC LIMIT 200`);
  res.json({ success: true, data: rows });
});

router.get('/stores/balances', authProcurement, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT item_code, description, SUM(quantity_delta)::numeric AS quantity_on_hand FROM central_store_ledger GROUP BY item_code, description ORDER BY description`);
  res.json({ success: true, data: rows });
});

export default router;
