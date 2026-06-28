import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { connectPostgres } from '../db/postgres.js';

const router = express.Router();
const PAYROLL_ALLOWED_ROLES = new Set(['hr_staff', 'hospital_admin', 'admin', 'system_admin', 'super_admin']);
const authPayroll = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const role = decoded.role || decoded.userRole;
    if (!PAYROLL_ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ success: false, message: 'Payroll privileges required' });
    }

    const tenantId = decoded.organization_id || decoded.hospital_id || decoded.hospitalId || decoded.tenant_id || decoded.org_id;
    if (!tenantId || !Number.isInteger(Number(tenantId)) || Number(tenantId) <= 0) {
      return res.status(403).json({ success: false, message: 'Valid hospital context is required' });
    }

    req.payrollUser = decoded;
    req.tenantId = Number(tenantId);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
const ensureTables = async () => {
  const db = await connectPostgres();
  await db.query(`
    CREATE TABLE IF NOT EXISTS payroll_structures (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      employee_code VARCHAR(80) NOT NULL,
      employee_name VARCHAR(180) NOT NULL,
      department VARCHAR(120),
      designation VARCHAR(120),
      basic NUMERIC(12,2) NOT NULL,
      hra NUMERIC(12,2) NOT NULL DEFAULT 0,
      allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
      deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      month VARCHAR(20) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      gross_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      pf_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      esi_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      tds_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      net_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payroll_run_lines (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE,
      structure_id INTEGER REFERENCES payroll_structures(id) ON DELETE SET NULL,
      gross NUMERIC(12,2) NOT NULL,
      pf NUMERIC(12,2) NOT NULL,
      esi NUMERIC(12,2) NOT NULL,
      tds NUMERIC(12,2) NOT NULL,
      other_deductions NUMERIC(12,2) NOT NULL,
      net NUMERIC(12,2) NOT NULL
    );
  `);
  return db;
};

router.get('/structures', authPayroll, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM payroll_structures WHERE tenant_id = $1 AND active = TRUE ORDER BY employee_name', [req.tenantId]);
  res.json({ success: true, data: rows });
});
router.post('/structures', authPayroll, async (req, res) => {
  const db = await ensureTables();
  const { employeeCode, employeeName, department, designation, basic, hra = 0, allowances = 0, deductions = 0 } = req.body;
  if (!employeeCode || !employeeName || basic === undefined) return res.status(400).json({ success: false, message: 'employeeCode, employeeName and basic are required' });
  const { rows } = await db.query(`INSERT INTO payroll_structures (tenant_id, employee_code, employee_name, department, designation, basic, hra, allowances, deductions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [req.tenantId, employeeCode, employeeName, department || null, designation || null, basic, hra, allowances, deductions]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/runs', authPayroll, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM payroll_runs WHERE tenant_id = $1 ORDER BY created_at DESC', [req.tenantId]);
  res.json({ success: true, data: rows });
});
router.post('/runs', authPayroll, async (req, res) => {
  const db = await ensureTables();
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  const { rows: structures } = await db.query('SELECT * FROM payroll_structures WHERE tenant_id = $1 AND active = TRUE', [req.tenantId]);
  const lines = structures.map((s) => {
    const gross = Number(s.basic) + Number(s.hra) + Number(s.allowances);
    const pf = Math.min(Number(s.basic) * 0.12, 1800);
    const esi = gross <= 21000 ? gross * 0.0075 : 0;
    const tds = gross > 50000 ? gross * 0.1 : 0;
    const other = Number(s.deductions);
    return { s, gross, pf, esi, tds, other, net: gross - pf - esi - tds - other };
  });
  const totals = lines.reduce((a, l) => ({ gross: a.gross+l.gross, pf:a.pf+l.pf, esi:a.esi+l.esi, tds:a.tds+l.tds, net:a.net+l.net }), {gross:0,pf:0,esi:0,tds:0,net:0});
  const { rows } = await db.query(`INSERT INTO payroll_runs (tenant_id, month, gross_total, pf_total, esi_total, tds_total, net_total) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.tenantId, month, totals.gross, totals.pf, totals.esi, totals.tds, totals.net]);
  for (const l of lines) await db.query(`INSERT INTO payroll_run_lines (run_id, structure_id, gross, pf, esi, tds, other_deductions, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [rows[0].id, l.s.id, l.gross, l.pf, l.esi, l.tds, l.other, l.net]);
  res.status(201).json({ success: true, data: rows[0], lineCount: lines.length });
});
router.get('/runs/:id', authPayroll, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT r.*, COALESCE(json_agg(json_build_object('employeeCode', s.employee_code, 'employeeName', s.employee_name, 'department', s.department, 'gross', l.gross, 'pf', l.pf, 'esi', l.esi, 'tds', l.tds, 'otherDeductions', l.other_deductions, 'net', l.net)) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines FROM payroll_runs r LEFT JOIN payroll_run_lines l ON l.run_id = r.id LEFT JOIN payroll_structures s ON s.id = l.structure_id WHERE r.id = $1 AND r.tenant_id = $2 GROUP BY r.id`, [req.params.id, req.tenantId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Payroll run not found' });
  res.json({ success: true, data: rows[0] });
});
router.patch('/runs/:id/finalize', authPayroll, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`UPDATE payroll_runs SET status = 'finalized' WHERE id = $1 AND tenant_id = $2 RETURNING *`, [req.params.id, req.tenantId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Payroll run not found' });
  res.json({ success: true, data: rows[0] });
});
export default router;
