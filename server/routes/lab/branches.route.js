/**
 * Lab branch registry — shared-login, branch-scoped views for multi-location labs
 * (e.g. Rado Labs). One lab login manages any number of branches; devices and
 * studies can be tagged to a branch so the portal can filter by location.
 *
 * GET    /api/lab/branches
 * POST   /api/lab/branches
 * GET    /api/lab/branches/:id
 * PUT    /api/lab/branches/:id
 * DELETE /api/lab/branches/:id
 */
import express from 'express';
import pool from '../../db/pgPool.js';
import { authLab } from '../../middleware/authLab.middleware.js';

const router = express.Router();

function labId(req) {
  return req.lab?.id;
}

function rowToBranch(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    city: row.city,
    state: row.state,
    phone: row.phone,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.use(authLab);

router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM lab_branches WHERE lab_id = $1 ORDER BY name ASC`,
      [labId(req)],
    );
    res.json({ success: true, branches: r.rows.map(rowToBranch) });
  } catch (err) {
    console.error('[LabBranches] list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list branches' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, code, address, city, state, phone } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }
    const r = await pool.query(
      `INSERT INTO lab_branches (lab_id, name, code, address, city, state, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING *`,
      [labId(req), name, code || null, address || null, city || null, state || null, phone || null],
    );
    res.status(201).json({ success: true, branch: rowToBranch(r.rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A branch with this code already exists' });
    }
    console.error('[LabBranches] create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create branch' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM lab_branches WHERE lab_id = $1 AND id = $2 LIMIT 1`,
      [labId(req), req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Branch not found' });
    res.json({ success: true, branch: rowToBranch(r.rows[0]) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch branch' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT * FROM lab_branches WHERE lab_id = $1 AND id = $2 LIMIT 1`,
      [labId(req), req.params.id],
    );
    if (!existing.rows[0]) return res.status(404).json({ success: false, message: 'Branch not found' });

    const row = existing.rows[0];
    const name = req.body?.name ?? row.name;
    const code = req.body?.code ?? row.code;
    const address = req.body?.address ?? row.address;
    const city = req.body?.city ?? row.city;
    const state = req.body?.state ?? row.state;
    const phone = req.body?.phone ?? row.phone;
    const status = req.body?.status ?? row.status;

    const r = await pool.query(
      `UPDATE lab_branches
       SET name = $3, code = $4, address = $5, city = $6, state = $7, phone = $8, status = $9, updated_at = NOW()
       WHERE lab_id = $1 AND id = $2
       RETURNING *`,
      [labId(req), req.params.id, name, code, address, city, state, phone, status],
    );
    res.json({ success: true, branch: rowToBranch(r.rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A branch with this code already exists' });
    }
    console.error('[LabBranches] update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update branch' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM lab_branches WHERE lab_id = $1 AND id = $2 RETURNING id`,
      [labId(req), req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Branch not found' });
    res.json({ success: true, deleted: req.params.id });
  } catch (err) {
    console.error('[LabBranches] delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete branch' });
  }
});

export default router;
