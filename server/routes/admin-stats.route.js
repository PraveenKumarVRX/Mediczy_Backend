import express from 'express';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const router = express.Router();

// GET /api/dashboard/stats - Dashboard statistics (public read-only endpoint)
router.get('/dashboard/stats', async (req, res) => {
  // Public endpoint - no auth required for read-only stats
  try {
    // Get users count
    const [usersResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM users');
    const usersCount = parseInt(usersResult[0]?.count || 0);
    
    // Get doctors count
    const [doctorsResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM doctors');
    const doctorsCount = parseInt(doctorsResult[0]?.count || 0);
    
    // Get clinics count from tenants
    const [clinicsResult] = await postgresSequelize.query("SELECT COUNT(*) as count FROM tenants WHERE type = 'clinic'");
    const clinicsCount = parseInt(clinicsResult[0]?.count || 0);
    
    // Get hospitals count
    const [hospitalsResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM hospitals');
    const hospitalsCount = parseInt(hospitalsResult[0]?.count || 0);
    
    // Placeholder counts
    const labsCount = 0;
    const pharmaciesCount = 0;
    const corporatesCount = 0;
    
    // Get recent users (last 5)
    const [recentUsers] = await postgresSequelize.query(`
      SELECT id, "firstName", "lastName", email, "createdAt" 
      FROM users 
      ORDER BY "createdAt" DESC 
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
