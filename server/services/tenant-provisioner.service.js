/**
 * Tenant Provisioner Service
 * 
 * Handles infrastructure provisioning for all 4 isolation levels:
 * - shared_row: Row-level security in shared DB
 * - shared_schema: Separate PostgreSQL schema
 * - dedicated_db: Separate PostgreSQL database
 * - dedicated_server: Full PM2/Docker instance + dedicated DB
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { connectPostgres } from '../db/postgres.js';
import tenantRegistry from './tenant-registry.service.js';

const execAsync = promisify(exec);

class TenantProvisioner {
  constructor() {
    this.baseDir = process.env.TENANT_BASE_DIR || '/opt/mediczy/tenants';
    this.basePort = parseInt(process.env.TENANT_BASE_PORT || '8010');
  }

  /**
   * Provision tenant infrastructure based on isolation level
   */
  async provision(tenantId, isolationLevel, options = {}) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    console.log(`🏗️ Provisioning tenant ${tenant.slug} at level: ${isolationLevel}`);

    let result;
    switch (isolationLevel) {
      case 'shared_row':
        result = await this.provisionSharedRow(tenant, options);
        break;
      case 'shared_schema':
        result = await this.provisionSharedSchema(tenant, options);
        break;
      case 'dedicated_db':
        result = await this.provisionDedicatedDB(tenant, options);
        break;
      case 'dedicated_server':
        result = await this.provisionDedicatedServer(tenant, options);
        break;
      default:
        throw new Error(`Unknown isolation level: ${isolationLevel}`);
    }

    // Update tenant status
    await tenantRegistry.updateTenantSettings(tenantId, {
      isolation_level: isolationLevel,
      provisioned_at: new Date().toISOString(),
      ...result.config
    });

    await tenantRegistry.updateTenant(tenantId, { status: 'active' });

    console.log(`✅ Tenant ${tenant.slug} provisioned successfully`);
    return result;
  }

  // ── Level 1: Shared Row-Level (Default) ────────────────────
  async provisionSharedRow(tenant, options) {
    const pool = await connectPostgres();

    // Ensure RLS is enabled on key tables
    const tables = ['appointments', 'prescriptions', 'clinical_notes', 'lab_results'];
    for (const table of tables) {
      try {
        await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        await pool.query(`
          DO $$ BEGIN
            CREATE POLICY tenant_isolation_${tenant.slug}_${table} ON ${table}
              USING (tenant_id = current_setting('app.current_tenant_id', true));
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
      } catch (e) {
        // Table may not exist or policy already exists — skip
      }
    }

    return {
      level: 'shared_row',
      config: {
        db_config: { host: '127.0.0.1', port: 5432, dbName: 'mediczy_ai', schema: 'public' }
      }
    };
  }

  // ── Level 2: Shared Schema ─────────────────────────────────
  async provisionSharedSchema(tenant, options) {
    const pool = await connectPostgres();
    const schemaName = `tenant_${tenant.slug.replace(/[^a-z0-9_]/g, '_')}`;

    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Run core table creation in new schema
    const coreTables = ['users', 'appointments', 'prescriptions', 'clinical_notes'];
    for (const table of coreTables) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE public."${table}" INCLUDING ALL)
        `);
      } catch (e) {
        // Table may not exist in public — skip
      }
    }

    return {
      level: 'shared_schema',
      config: {
        db_config: { host: '127.0.0.1', port: 5432, dbName: 'mediczy_ai', schema: schemaName }
      }
    };
  }

  // ── Level 3: Dedicated Database ────────────────────────────
  async provisionDedicatedDB(tenant, options) {
    const pool = await connectPostgres();
    const dbName = `mediczy_${tenant.slug.replace(/[^a-z0-9_]/g, '_')}`;

    // Create database
    try {
      await pool.query(`CREATE DATABASE "${dbName}"`);
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }

    // Enable extensions
    const { Client } = (await import('pg')).default;
    const client = new Client({
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: dbName,
      user: process.env.POSTGRES_USER || 'mediczy_helper',
      password: process.env.POSTGRES_PASSWORD
    });

    try {
      await client.connect();
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      try { await client.query('CREATE EXTENSION IF NOT EXISTS "vector"'); } catch (e) { /* optional */ }
    } finally {
      await client.end();
    }

    return {
      level: 'dedicated_db',
      config: {
        db_config: { host: '127.0.0.1', port: 5432, dbName, schema: 'public' }
      }
    };
  }

  // ── Level 4: Dedicated Server ──────────────────────────────
  async provisionDedicatedServer(tenant, options) {
    const slug = tenant.slug.replace(/[^a-z0-9_-]/g, '_');
    const tenantDir = path.join(this.baseDir, slug);
    const port = options.port || await this.findAvailablePort();

    // 1. Create dedicated database
    const dbResult = await this.provisionDedicatedDB(tenant, options);

    // 2. Create tenant directory with symlinks to shared code
    await fs.mkdir(tenantDir, { recursive: true });

    // Create tenant-specific env file
    const envContent = [
      `PORT=${port}`,
      `NODE_ENV=production`,
      `POSTGRES_HOST=127.0.0.1`,
      `POSTGRES_PORT=5432`,
      `POSTGRES_DB=${dbResult.config.db_config.dbName}`,
      `POSTGRES_USER=${process.env.POSTGRES_USER || 'mediczy_helper'}`,
      `POSTGRES_PASSWORD=${process.env.POSTGRES_PASSWORD}`,
      `TENANT_ID=${tenant.id}`,
      `TENANT_SLUG=${slug}`,
      `JWT_SECRET=${process.env.JWT_SECRET}`,
      `GROQ_API_KEY=${process.env.GROQ_API_KEY || ''}`,
      `SIB_URL=${process.env.SIB_URL || 'http://localhost:8001'}`,
    ].join('\n');

    await fs.writeFile(path.join(tenantDir, '.env'), envContent);

    // 3. Create PM2 ecosystem config
    const ecosystem = {
      apps: [{
        name: `mediczy-tenant-${slug}`,
        script: path.resolve(process.cwd(), 'start-wrapper.cjs'),
        cwd: process.cwd(),
        instances: 1,
        exec_mode: 'cluster',
        env: {
          PORT: port,
          NODE_ENV: 'production',
          POSTGRES_DB: dbResult.config.db_config.dbName,
          TENANT_ID: String(tenant.id),
          TENANT_SLUG: slug
        }
      }]
    };

    await fs.writeFile(
      path.join(tenantDir, 'ecosystem.config.json'),
      JSON.stringify(ecosystem, null, 2)
    );

    return {
      level: 'dedicated_server',
      config: {
        server_config: { host: '127.0.0.1', port, pm2Name: `mediczy-tenant-${slug}`, dir: tenantDir },
        db_config: dbResult.config.db_config
      }
    };
  }

  // ── Server Management ──────────────────────────────────────
  async startTenantServer(tenantId) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    const config = tenant?.settings?.server_config;
    if (!config?.pm2Name) throw new Error('No dedicated server configured');
    const ecoFile = path.join(config.dir, 'ecosystem.config.json');
    await execAsync(`pm2 start ${ecoFile}`);
    return { status: 'started', pm2Name: config.pm2Name };
  }

  async stopTenantServer(tenantId) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    const config = tenant?.settings?.server_config;
    if (!config?.pm2Name) throw new Error('No dedicated server configured');
    await execAsync(`pm2 stop ${config.pm2Name}`);
    return { status: 'stopped' };
  }

  async restartTenantServer(tenantId) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    const config = tenant?.settings?.server_config;
    if (!config?.pm2Name) throw new Error('No dedicated server configured');
    await execAsync(`pm2 reload ${config.pm2Name}`);
    return { status: 'restarted' };
  }

  async getTenantServerStatus(tenantId) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    const config = tenant?.settings?.server_config;
    if (!config?.pm2Name) return { status: 'not_configured' };
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes = JSON.parse(stdout);
      const proc = processes.find(p => p.name === config.pm2Name);
      return proc ? {
        status: proc.pm2_env.status,
        cpu: proc.monit?.cpu,
        memory: proc.monit?.memory,
        uptime: proc.pm2_env.pm_uptime,
        restarts: proc.pm2_env.restart_time
      } : { status: 'not_found' };
    } catch {
      return { status: 'unknown' };
    }
  }

  // ── Domain / SSL ───────────────────────────────────────────
  async configureDomain(tenantId, subdomain, customDomain) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const domainConfig = {
      subdomain: subdomain || tenant.subdomain,
      customDomain: customDomain || null,
      sslConfigured: false
    };

    // Generate nginx config
    const serverConfig = tenant.settings?.server_config || {};
    const upstream = serverConfig.port ? `http://127.0.0.1:${serverConfig.port}` : 'http://127.0.0.1:8888';

    const serverNames = [domainConfig.subdomain + '.mediqzy.com'];
    if (domainConfig.customDomain) serverNames.push(domainConfig.customDomain);

    const nginxConfig = `
# Tenant: ${tenant.name} (${tenant.slug})
# Auto-generated — do not edit manually
server {
    listen 80;
    server_name ${serverNames.join(' ')};

    location / {
        proxy_pass ${upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Tenant-ID ${tenant.slug};
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

    domainConfig.nginxConfig = nginxConfig;

    await tenantRegistry.updateTenantSettings(tenantId, { domain_config: domainConfig });
    return domainConfig;
  }

  // ── Helpers ────────────────────────────────────────────────
  async findAvailablePort() {
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes = JSON.parse(stdout);
      const usedPorts = processes
        .filter(p => p.name.startsWith('mediczy-tenant-'))
        .map(p => p.pm2_env?.PORT || 0)
        .filter(Boolean);
      let port = this.basePort;
      while (usedPorts.includes(port)) port++;
      return port;
    } catch {
      return this.basePort;
    }
  }

  // ── Upgrade Isolation Level ────────────────────────────────
  async upgrade(tenantId, newLevel) {
    const tenant = await tenantRegistry.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found');
    const currentLevel = tenant.settings?.isolation_level || 'shared_row';
    const levels = ['shared_row', 'shared_schema', 'dedicated_db', 'dedicated_server'];
    if (levels.indexOf(newLevel) <= levels.indexOf(currentLevel)) {
      throw new Error(`Cannot downgrade from ${currentLevel} to ${newLevel}`);
    }
    return this.provision(tenantId, newLevel);
  }
}

const tenantProvisioner = new TenantProvisioner();
export default tenantProvisioner;
export { TenantProvisioner };
