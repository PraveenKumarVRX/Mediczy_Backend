import express from 'express';
import mysql from 'mysql2/promise';

const router = express.Router();

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

// GET /api/dashboard/stats - Dashboard statistics (public read-only endpoint)
router.get('/dashboard/stats', async (req, res) => {
  // Public endpoint - no auth required for read-only stats
  try {
    const pool = await getPool();
    
    // Get users count
    const [usersResult] = await pool.query('SELECT COUNT(*) as count FROM users');
    const usersCount = usersResult[0].count;
    
    // Get doctors count
    const [doctorsResult] = await pool.query('SELECT COUNT(*) as count FROM doctors');
    const doctorsCount = doctorsResult[0].count;
    
    // Get labs count (clinics with category='lab')
    const [labsResult] = await pool.query("SELECT COUNT(*) as count FROM clinics WHERE category='lab'");
    const labsCount = labsResult[0].count;
    
    // Get clinics count (excluding labs - only polyclinic and dental categories)
    const [clinicsResult] = await pool.query("SELECT COUNT(*) as count FROM clinics WHERE category != 'lab'");
    const clinicsCount = clinicsResult[0].count;
    
    // Get pharmacies count (for now, using placeholder - add pharmacies table later)
    const pharmaciesCount = 0;
    
    // Get hospitals count
    const [hospitalsResult] = await pool.query('SELECT COUNT(*) as count FROM hospitals');
    const hospitalsCount = hospitalsResult[0].count;
    
    // Get corporates count (placeholder for now)
    const corporatesCount = 0;
    const activeCorporatesCount = 0;
    
    // Get recent users (last 5)
    const [recentUsers] = await pool.query(`
      SELECT id, firstName, lastName, email, createdAt 
      FROM users 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);
    
    res.json({
      stats: {
        users: usersCount,
        doctors: doctorsCount,
        labs: labsCount,
        clinics: clinicsCount,
        pharmacies: pharmaciesCount,
        hospitals: hospitalsCount,
        corporates: corporatesCount
      },
      recentUsers
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

export default router;
