import express from 'express';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { authUser } from '../middleware/auth.middleware.js';
import { adminLimiter } from '../middleware/rateLimiter.middleware.js';
import logger from '../config/logger.js';  // Default export

const router = express.Router();

// GET /api/dashboard/stats - Dashboard statistics
// SECURITY: Protected endpoint with authentication and rate limiting
router.get('/dashboard/stats',
  adminLimiter,           // 20 requests per minute for admin endpoints
  authUser,               // Require authentication
  async (req, res) => {
    try {
      // Verify user has admin privileges
      const userRole = req.user?.role || req.user?.userType;
      const isAdmin = ['admin', 'superadmin', 'staff'].includes(userRole);
      
      if (!isAdmin) {
        logger.warn('Unauthorized stats access attempt', {
          userId: req.user?.id,
          role: userRole,
          ip: req.ip
        });
        return res.status(403).json({ error: 'Admin access required' });
      }
      
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
      
      // SECURITY: Removed PII exposure - no longer returning user names/emails
      // Get recent user count only (no PII)
      const [recentUsersCount] = await postgresSequelize.query(`
        SELECT COUNT(*) as count
        FROM users 
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
      `);
      
      // Audit log for stats access
      logger.info('Admin stats accessed', {
        userId: req.user.id,
        userEmail: req.user.email,
        role: userRole,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      
      res.json({
        stats: {
          users: usersCount,
          doctors: doctorsCount,
          labs: labsCount,
          clinics: clinicsCount,
          pharmacies: pharmaciesCount,
          hospitals: hospitalsCount,
          corporates: corporatesCount,
          recentUsers24h: parseInt(recentUsersCount[0]?.count || 0)
        },
        // REMOVED: recentUsers array (contained PII - names, emails)
        accessedAt: new Date().toISOString(),
        accessedBy: req.user.id
      });
    } catch (error) {
      logger.error('Error fetching dashboard stats:', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack
      });
      res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
  }
);

export default router;
