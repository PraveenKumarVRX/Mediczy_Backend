import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getPool as pgPool } from '../../../server/db/postgres.js';
import { cacheGet, cacheSet } from '../../../server/config/redis-hardened.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Platform stats ─────────────────────────────────────────────────────────

  async getPlatformStats() {
    const cacheKey = 'admin:platform:stats';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const pool = pgPool();
    const [tenantStats, userStats, appointmentStats, aiStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE')    AS active,
          COUNT(*) FILTER (WHERE status = 'TRIAL')     AS trial,
          COUNT(*) FILTER (WHERE subscription_plan = 'ENTERPRISE') AS enterprise,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_30d
        FROM platform_tenants
      `),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'active') AS active,
               COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days') AS new_7d
        FROM users
      `),
      pool.query(`
        SELECT COUNT(*) AS total_today
        FROM appointments
        WHERE "appointmentDate" = CURRENT_DATE
      `),
      pool.query(`
        SELECT COUNT(*) AS total_runs,
               AVG(latency_ms)::int AS avg_latency_ms,
               SUM(total_tokens) AS total_tokens
        FROM ai_agent_runs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
    ]);

    const stats = {
      tenants:      tenantStats.rows[0],
      users:        userStats.rows[0],
      appointments: appointmentStats.rows[0],
      ai:           aiStats.rows[0],
      generatedAt:  new Date().toISOString(),
    };

    await cacheSet(cacheKey, stats, 60);
    return stats;
  }

  // ── Audit logs ─────────────────────────────────────────────────────────────

  async getAuditLogs(filters: {
    tenantId?: string; userId?: number; eventType?: string;
    from?: string; to?: string; page: number; limit: number;
  }) {
    const pool   = pgPool();
    const offset = (filters.page - 1) * filters.limit;
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (filters.tenantId)  { params.push(filters.tenantId);  where.push(`tenant_id = $${params.length}::uuid`); }
    if (filters.userId)    { params.push(filters.userId);    where.push(`user_id = $${params.length}`); }
    if (filters.eventType) { params.push(filters.eventType); where.push(`event_type = $${params.length}`); }
    if (filters.from)      { params.push(new Date(filters.from)); where.push(`created_at >= $${params.length}`); }
    if (filters.to)        { params.push(new Date(filters.to));   where.push(`created_at <= $${params.length}`); }

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT log_id, tenant_id, user_id, event_type, event_category,
                actor_email, actor_role, actor_ip, target_type, target_id,
                status, created_at
         FROM platform_audit_logs
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, filters.limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM platform_audit_logs WHERE ${where.join(' AND ')}`, params),
    ]);

    return {
      data:  rows.rows,
      total: parseInt(countRow.rows[0].count, 10),
      page:  filters.page,
      limit: filters.limit,
    };
  }

  // ── User management ────────────────────────────────────────────────────────

  async searchUsers(query: string, page = 1, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { email:       { contains: query, mode: 'insensitive' } },
          { firstName:   { contains: query, mode: 'insensitive' } },
          { lastName:    { contains: query, mode: 'insensitive' } },
          { phoneNumber: { contains: query } },
        ],
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phoneNumber: true, role: true, status: true,
        organizationId: true, createdAt: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleUserStatus(userId: number, status: 'active' | 'suspended') {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { status: status as any },
    });
  }

  // ── RBAC ───────────────────────────────────────────────────────────────────

  async getRoles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async createRole(data: { name: string; description: string; permissions: string[] }) {
    return this.prisma.role.create({ data: { ...data, permissions: data.permissions } });
  }

  // ── Health check ───────────────────────────────────────────────────────────

  async getSystemHealth() {
    const pool = pgPool();
    const checks = await Promise.allSettled([
      pool.query('SELECT 1').then(() => ({ db: 'ok' })),
      import('../../../server/config/redis-hardened.js').then(async m => {
        const r = m.redisCache();
        await r.ping();
        return { redis: 'ok' };
      }),
    ]);

    return {
      status:    checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'degraded',
      postgres:  checks[0].status === 'fulfilled' ? 'ok' : 'error',
      redis:     checks[1].status === 'fulfilled' ? 'ok' : 'error',
      uptime:    Math.floor(process.uptime()),
      memory:    process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
