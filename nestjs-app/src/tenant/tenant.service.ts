import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getPool as pgPool } from '../../../server/db/postgres.js';
import { provisionTenantDatabase } from '../../../server/services/dedicated-db-provisioner.service.js';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';
import { cacheGet, cacheSet, cacheDel } from '../../../server/config/redis-hardened.js';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tenant CRUD ───────────────────────────────────────────────────────────

  async listTenants(filters: { status?: string; type?: string; page: number; limit: number }) {
    const pool   = pgPool();
    const offset = (filters.page - 1) * filters.limit;

    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (filters.status) { params.push(filters.status); where.push(`status = $${params.length}`); }
    if (filters.type)   { params.push(filters.type);   where.push(`tenant_type = $${params.length}`); }

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT tenant_id, tenant_code, tenant_name, tenant_type, subscription_plan,
                subscription_status, status, created_at
         FROM platform_tenants
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, filters.limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM platform_tenants WHERE ${where.join(' AND ')}`, params),
    ]);

    return {
      data:  rows.rows,
      total: parseInt(countRow.rows[0].count, 10),
      page:  filters.page,
      limit: filters.limit,
    };
  }

  async getTenant(tenantId: string) {
    const cacheKey = `tenant:${tenantId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const pool = pgPool();
    const { rows } = await pool.query(
      `SELECT * FROM platform_tenants WHERE tenant_id = $1`, [tenantId]
    );
    if (!rows.length) throw new NotFoundException(`Tenant ${tenantId} not found`);

    await cacheSet(cacheKey, rows[0], 300);
    return rows[0];
  }

  async createTenant(data: {
    tenantCode:       string;
    tenantName:       string;
    tenantType:       string;
    contactEmail:     string;
    subscriptionPlan: string;
    dbStrategy?:      string;
    createdBy?:       string;
  }) {
    const pool = pgPool();

    // Check uniqueness
    const existing = await pool.query(
      `SELECT 1 FROM platform_tenants WHERE tenant_code = $1`, [data.tenantCode]
    );
    if (existing.rows.length) throw new ConflictException(`Tenant code ${data.tenantCode} already exists`);

    const { rows } = await pool.query(
      `INSERT INTO platform_tenants
         (tenant_code, tenant_name, tenant_type, contact_email,
          subscription_plan, db_strategy, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::uuid)
       RETURNING *`,
      [
        data.tenantCode, data.tenantName, data.tenantType, data.contactEmail,
        data.subscriptionPlan || 'STARTER',
        data.dbStrategy || 'SHARED',
        data.createdBy || null,
      ]
    );

    const tenant = rows[0];

    // Provision database layer (async — don't block response)
    provisionTenantDatabase({
      tenantId:         tenant.tenant_id,
      tenantCode:       tenant.tenant_code,
      dbStrategy:       tenant.db_strategy,
      subscriptionPlan: tenant.subscription_plan,
    }).catch(err => console.error('[TenantService] Provisioning error:', err.message));

    await publishEvent(KAFKA_TOPICS.TENANT_PROVISIONED, { tenantId: tenant.tenant_id }).catch(() => {});

    return tenant;
  }

  async updateTenantStatus(tenantId: string, status: string, reason?: string) {
    const pool = pgPool();
    const { rows } = await pool.query(
      `UPDATE platform_tenants
       SET status = $1,
           ${status === 'SUSPENDED' ? 'suspended_at = NOW(),' : ''}
           suspension_reason = $2,
           updated_at = NOW()
       WHERE tenant_id = $3
       RETURNING *`,
      [status, reason || null, tenantId]
    );

    if (!rows.length) throw new NotFoundException(`Tenant ${tenantId} not found`);
    await cacheDel(`tenant:${tenantId}`);

    if (status === 'SUSPENDED') {
      await publishEvent(KAFKA_TOPICS.TENANT_SUSPENDED, { tenantId, reason }).catch(() => {});
    }

    return rows[0];
  }

  async getTenantUsage(tenantId: string) {
    const pool = pgPool();

    const [tenantRow, userCount, appointmentCount] = await Promise.all([
      pool.query(`SELECT current_usage, limits FROM platform_tenants WHERE tenant_id = $1`, [tenantId]),
      pool.query(`SELECT COUNT(*) FROM users WHERE tenant_id = (SELECT id FROM tenants WHERE metadata->>'platform_tenant_id' = $1 LIMIT 1)`, [tenantId]),
      pool.query(`SELECT COUNT(*) FROM appointments WHERE tenant_id = (SELECT id FROM tenants WHERE metadata->>'platform_tenant_id' = $1 LIMIT 1)`, [tenantId]),
    ]);

    return {
      limits:      tenantRow.rows[0]?.limits || {},
      currentUsage: {
        users:       parseInt(userCount.rows[0]?.count || '0', 10),
        appointments: parseInt(appointmentCount.rows[0]?.count || '0', 10),
      },
    };
  }

  // ── Admin: User Management ────────────────────────────────────────────────

  async getPlatformStats() {
    const pool = pgPool();
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')       AS active_tenants,
        COUNT(*) FILTER (WHERE status = 'TRIAL')        AS trial_tenants,
        COUNT(*) FILTER (WHERE subscription_plan = 'ENTERPRISE') AS enterprise_tenants,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
      FROM platform_tenants
    `);
    return rows[0];
  }
}
