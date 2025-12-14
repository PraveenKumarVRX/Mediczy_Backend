import express from 'express';
const router = express.Router();
import mysql from 'mysql2/promise';

async function getPool() {
  return mysql.createPool({
    host: 'localhost',
    user: process.env.DB_USER || 'mediczy',
    password: process.env.DB_PASSWORD || 'Mediczy2024Secure',
    database: process.env.DB_NAME || 'mediczy',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// GET /api/clinics - list clinics with filters
router.get('/', async (req, res) => {
  const { city, state, pincode, search, category = 'general', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = [];
  const params = [];

  if (category) { where.push('category = ?'); params.push(category); }
  if (city) { where.push('city = ?'); params.push(city); }
  if (state) { where.push('state = ?'); params.push(state); }
  if (pincode) { where.push('pincode = ?'); params.push(pincode); }
  if (search) {
    where.push('(name LIKE ? OR address LIKE ? OR city LIKE ? OR state LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT id, name, areaName, isChain, email, phone, address, city, state, pincode, ownerName, services, google_place_id, category, isActive, createdAt, updatedAt
       FROM clinics ${whereSql}
       ORDER BY updatedAt DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) as count FROM clinics ${whereSql}`, params);
    res.json({ data: rows, page: parseInt(page), limit: parseInt(limit), total: countRows[0].count });
  } catch (err) {
    console.error('Error fetching clinics:', err);
    res.status(500).json({ error: 'Failed to fetch clinics' });
  }
});

// GET /api/clinics/:id - clinic detail
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT * FROM clinics WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching clinic detail:', err);
    res.status(500).json({ error: 'Failed to fetch clinic detail' });
  }
});

export default router;
