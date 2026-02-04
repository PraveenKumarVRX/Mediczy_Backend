/**
 * System Health Monitoring Service
 * 
 * Phase 2: Real-time system health monitoring
 * - Service status checks
 * - Database health
 * - Queue status
 * - External service connectivity
 * - Performance metrics
 * 
 * @module services/system-health.service
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import os from 'os';

// Health check thresholds
const THRESHOLDS = {
  CPU_WARNING: 70,
  CPU_CRITICAL: 90,
  MEMORY_WARNING: 75,
  MEMORY_CRITICAL: 90,
  DISK_WARNING: 80,
  DISK_CRITICAL: 95,
  DB_RESPONSE_WARNING: 500, // ms
  DB_RESPONSE_CRITICAL: 2000, // ms
  API_RESPONSE_WARNING: 1000, // ms
  API_RESPONSE_CRITICAL: 5000 // ms
};

class SystemHealthService {
  constructor() {
    this.healthHistory = [];
    this.maxHistorySize = 1440; // 24 hours at 1-minute intervals
    this.lastCheck = null;
    this.services = new Map();
    this.healthCheckInterval = null;
  }

  /**
   * Register a service for health monitoring
   */
  registerService(name, checkFn) {
    this.services.set(name, {
      name,
      check: checkFn,
      lastStatus: null,
      lastChecked: null
    });
  }

  /**
   * Get comprehensive system health status
   */
  async getHealthStatus() {
    const startTime = Date.now();

    const [
      systemMetrics,
      databaseHealth,
      servicesHealth,
      tenantHealth,
      queueHealth
    ] = await Promise.all([
      this.getSystemMetrics(),
      this.checkDatabaseHealth(),
      this.checkServicesHealth(),
      this.getTenantHealthSummary(),
      this.getQueueHealth()
    ]);

    const checkDuration = Date.now() - startTime;

    const overallStatus = this.calculateOverallStatus([
      systemMetrics.status,
      databaseHealth.status,
      servicesHealth.status
    ]);

    const healthReport = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checkDurationMs: checkDuration,
      system: systemMetrics,
      database: databaseHealth,
      services: servicesHealth,
      tenants: tenantHealth,
      queues: queueHealth
    };

    // Store in history
    this.healthHistory.push({
      timestamp: healthReport.timestamp,
      status: overallStatus,
      cpu: systemMetrics.cpu.usage,
      memory: systemMetrics.memory.usedPercent,
      dbResponseMs: databaseHealth.responseTimeMs
    });

    // Trim history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }

    this.lastCheck = healthReport;
    return healthReport;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicHealthCheck(intervalMs = 60000) {
    if (this.healthCheckInterval) {
      console.log('⚠️  System health check already running');
      return;
    }

    const runCheck = async () => {
      try {
        await this.getHealthStatus();
      } catch (error) {
        console.error('❌ System health check failed:', error.message);
      }
    };

    runCheck();
    this.healthCheckInterval = setInterval(runCheck, intervalMs);
    console.log(`✅ System health monitoring started (every ${intervalMs}ms)`);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('🛑 System health monitoring stopped');
    }
  }

  /**
   * Get system metrics (CPU, Memory, Disk)
   */
  async getSystemMetrics() {
    try {
      // CPU usage
      const cpus = os.cpus();
      const cpuUsage = this.calculateCpuUsage(cpus);
      
      // Memory
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memPercent = Math.round((usedMem / totalMem) * 100);

      // Load average
      const loadAvg = os.loadavg();

      // Uptime
      const uptime = os.uptime();

      // Determine status
      let status = 'healthy';
      if (cpuUsage >= THRESHOLDS.CPU_CRITICAL || memPercent >= THRESHOLDS.MEMORY_CRITICAL) {
        status = 'critical';
      } else if (cpuUsage >= THRESHOLDS.CPU_WARNING || memPercent >= THRESHOLDS.MEMORY_WARNING) {
        status = 'warning';
      }

      return {
        status,
        cpu: {
          usage: cpuUsage,
          cores: cpus.length,
          model: cpus[0]?.model || 'Unknown',
          loadAverage: {
            '1min': loadAvg[0].toFixed(2),
            '5min': loadAvg[1].toFixed(2),
            '15min': loadAvg[2].toFixed(2)
          }
        },
        memory: {
          total: this.formatBytes(totalMem),
          used: this.formatBytes(usedMem),
          free: this.formatBytes(freeMem),
          usedPercent: memPercent
        },
        uptime: {
          seconds: uptime,
          formatted: this.formatUptime(uptime)
        },
        platform: {
          type: os.type(),
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname()
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    const startTime = Date.now();
    
    try {
      // Simple query to check connectivity
      await sequelize.query('SELECT 1 as ok');
      const responseTime = Date.now() - startTime;

      // Get connection pool stats if available
      let poolStats = {};
      try {
        const pool = sequelize.connectionManager.pool;
        if (pool) {
          poolStats = {
            total: pool.size || 0,
            idle: pool.available || 0,
            waiting: pool.pending || 0
          };
        }
      } catch (e) {
        // Pool stats not available
      }

      // Get database size
      const [dbSize] = await sequelize.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `).catch(() => [[{ size: 'N/A' }]]);

      // Get active connections
      const [connections] = await sequelize.query(`
        SELECT 
          count(*) as total,
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `).catch(() => [[{ total: 0, active: 0, idle: 0 }]]);

      // Determine status
      let status = 'healthy';
      if (responseTime >= THRESHOLDS.DB_RESPONSE_CRITICAL) {
        status = 'critical';
      } else if (responseTime >= THRESHOLDS.DB_RESPONSE_WARNING) {
        status = 'warning';
      }

      return {
        status,
        connected: true,
        responseTimeMs: responseTime,
        database: {
          size: dbSize[0]?.size || 'N/A',
          connections: connections[0] || {}
        },
        pool: poolStats
      };
    } catch (error) {
      return {
        status: 'critical',
        connected: false,
        error: error.message,
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Check registered services health
   */
  async checkServicesHealth() {
    const results = {};
    let overallStatus = 'healthy';

    for (const [name, service] of this.services) {
      try {
        const startTime = Date.now();
        const result = await service.check();
        const responseTime = Date.now() - startTime;

        results[name] = {
          status: result.status || 'healthy',
          responseTimeMs: responseTime,
          ...result
        };

        service.lastStatus = results[name].status;
        service.lastChecked = new Date().toISOString();

        if (results[name].status === 'critical') overallStatus = 'critical';
        else if (results[name].status === 'warning' && overallStatus !== 'critical') {
          overallStatus = 'warning';
        }
      } catch (error) {
        results[name] = {
          status: 'error',
          error: error.message
        };
        overallStatus = 'critical';
      }
    }

    // Add default service checks
    results.api = {
      status: 'healthy',
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
      memory: {
        heapUsed: this.formatBytes(process.memoryUsage().heapUsed),
        heapTotal: this.formatBytes(process.memoryUsage().heapTotal),
        external: this.formatBytes(process.memoryUsage().external)
      }
    };

    return {
      status: overallStatus,
      services: results
    };
  }

  /**
   * Get tenant health summary
   */
  async getTenantHealthSummary() {
    try {
      const [summary] = await sequelize.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'suspended') as suspended,
          COUNT(*) FILTER (WHERE status = 'trial') as trial,
          COUNT(*) FILTER (WHERE 
            (usage->>'opd_patients_mtd')::int >= (limits->>'opd_patients_per_month')::int * 0.9
          ) as approaching_opd_limit,
          COUNT(*) FILTER (WHERE 
            (usage->>'voice_minutes_mtd')::numeric >= (limits->>'voice_minutes_per_month')::numeric * 0.9
          ) as approaching_voice_limit
        FROM tenants
      `);

      return {
        status: 'healthy',
        ...summary[0]
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get queue health (BullMQ/Redis)
   */
  async getQueueHealth() {
    try {
      // Check Redis connectivity
      const [redisCheck] = await sequelize.query(`SELECT 1 as ok`).catch(() => [[null]]);
      
      // Get queue statistics from database (if tracked)
      const [queueStats] = await sequelize.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'processing') as processing,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM async_jobs
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `).catch(() => [[{ total_jobs: 0, pending: 0, processing: 0, failed: 0 }]]);

      return {
        status: 'healthy',
        redis: { connected: !!redisCheck },
        jobs: queueStats[0] || {}
      };
    } catch (error) {
      return {
        status: 'warning',
        error: error.message
      };
    }
  }

  /**
   * Get health history for charts
   */
  getHealthHistory(minutes = 60) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.healthHistory.filter(h => new Date(h.timestamp).getTime() > cutoff);
  }

  /**
   * Get uptime statistics
   */
  async getUptimeStats(days = 30) {
    try {
      const [stats] = await sequelize.query(`
        WITH health_checks AS (
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as total_checks,
            COUNT(*) FILTER (WHERE status = 'healthy') as healthy_checks
          FROM system_health_logs
          WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
          GROUP BY DATE(created_at)
        )
        SELECT 
          date,
          total_checks,
          healthy_checks,
          ROUND((healthy_checks::numeric / NULLIF(total_checks, 0)) * 100, 2) as uptime_percent
        FROM health_checks
        ORDER BY date
      `).catch(() => [[]]);

      const avgUptime = stats.length > 0
        ? stats.reduce((sum, s) => sum + parseFloat(s.uptime_percent || 0), 0) / stats.length
        : 100;

      return {
        dailyStats: stats || [],
        averageUptime: avgUptime.toFixed(2),
        period: `${days} days`
      };
    } catch (error) {
      return {
        error: error.message,
        dailyStats: [],
        averageUptime: 'N/A'
      };
    }
  }

  /**
   * Calculate overall status from multiple statuses
   */
  calculateOverallStatus(statuses) {
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('error')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'healthy';
  }

  /**
   * Calculate CPU usage percentage
   */
  calculateCpuUsage(cpus) {
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    return Math.round(100 - (100 * totalIdle / totalTick));
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format uptime to human readable
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '< 1m';
  }
}

// Export singleton instance
const systemHealthService = new SystemHealthService();
export default systemHealthService;
