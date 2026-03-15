/**
 * Tenant Heartbeat Service
 * 
 * Sends periodic heartbeats from tenant instances to the control plane.
 * Monitors health of all tenant servers and alerts on missing heartbeats.
 */

import os from 'os';
import cron from 'node-cron';
import tenantRegistry from './tenant-registry.service.js';
import { connectPostgres } from '../db/postgres.js';

class TenantHeartbeatService {
  constructor() {
    this.tenantId = process.env.TENANT_ID || 'default';
    this.alerts = [];
  }

  /**
   * Start sending heartbeats (for tenant instances)
   */
  startSending() {
    // Send heartbeat every 60 seconds
    cron.schedule('* * * * *', () => this.sendHeartbeat());
    console.log(`💓 Heartbeat sender started for tenant ${this.tenantId}`);
  }

  async sendHeartbeat() {
    const metrics = {
      serverMetrics: {
        cpu: os.loadavg()[0],
        memoryUsed: Math.round((1 - os.freemem() / os.totalmem()) * 100),
        memoryTotal: Math.round(os.totalmem() / 1024 / 1024),
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version
      },
      appMetrics: {
        pid: process.pid,
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    };

    // Add DB metrics
    try {
      const pool = await connectPostgres();
      const dbStats = await pool.query(`SELECT 
        numbackends as connections,
        xact_commit as commits,
        xact_rollback as rollbacks,
        pg_database_size(current_database()) as db_size
        FROM pg_stat_database WHERE datname = current_database()`);
      metrics.dbMetrics = dbStats.rows[0] || {};
    } catch (e) {
      metrics.dbMetrics = { error: e.message };
    }

    tenantRegistry.recordHeartbeat(this.tenantId, metrics);
  }

  /**
   * Start monitoring (for control plane)
   * Checks all tenant heartbeats every 2 minutes
   */
  startMonitoring() {
    cron.schedule('*/2 * * * *', () => this.checkAllHeartbeats());
    console.log('🔍 Heartbeat monitor started');
  }

  async checkAllHeartbeats() {
    const { tenants } = await tenantRegistry.listTenants({ status: 'active' });
    const newAlerts = [];

    for (const tenant of tenants) {
      const health = tenantRegistry.checkHealth(String(tenant.id));
      if (health === 'warning' || health === 'critical') {
        newAlerts.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          health,
          timestamp: new Date()
        });
      }
    }

    this.alerts = newAlerts;
    if (newAlerts.length > 0) {
      console.warn(`⚠️ ${newAlerts.length} tenants with health issues:`, 
        newAlerts.map(a => `${a.tenantName}=${a.health}`).join(', '));
    }
  }

  getAlerts() {
    return this.alerts;
  }
}

const tenantHeartbeatService = new TenantHeartbeatService();
export default tenantHeartbeatService;
export { TenantHeartbeatService };
