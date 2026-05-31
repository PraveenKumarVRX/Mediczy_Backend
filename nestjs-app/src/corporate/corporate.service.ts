import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cacheGet, cacheSet } from '../../../server/config/redis-hardened.js';

@Injectable()
export class CorporateService {
  constructor(private readonly prisma: PrismaService) {}

  async getCorporateHealth(corporateId: number) {
    const cacheKey = `corporate:health:${corporateId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const [employeeStats, topConditions, appointmentTrend, coinsUsage] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) AS total_employees,
          SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS active,
          AVG(EXTRACT(YEAR FROM AGE(u."dateOfBirth")))::int AS avg_age
        FROM users u
        WHERE u."corporateId" = ${corporateId}
      `,
      this.prisma.$queryRaw<any[]>`
        SELECT pc.condition_name, COUNT(*) AS employee_count
        FROM patient_conditions pc
        JOIN users u ON u.id = pc.user_id
        WHERE u."corporateId" = ${corporateId}
          AND pc.status = 'ACTIVE'
        GROUP BY pc.condition_name
        ORDER BY employee_count DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<any[]>`
        SELECT DATE_TRUNC('month', a."appointmentDate") AS month,
               COUNT(*) AS count,
               COUNT(*) FILTER (WHERE a.status = 'completed') AS completed
        FROM appointments a
        JOIN users u ON u.id = a."userId"
        WHERE u."corporateId" = ${corporateId}
          AND a."appointmentDate" >= NOW() - INTERVAL '6 months'
        GROUP BY 1 ORDER BY 1
      `,
      this.prisma.$queryRaw<any[]>`
        SELECT SUM(hct.amount) FILTER (WHERE hct.amount > 0) AS total_earned,
               SUM(ABS(hct.amount)) FILTER (WHERE hct.amount < 0) AS total_spent
        FROM health_coins_transactions hct
        JOIN user_wallets uw ON uw.id = hct.wallet_id
        JOIN users u ON u.id = uw.user_id
        WHERE u."corporateId" = ${corporateId}
      `,
    ]);

    const result = {
      employees:       employeeStats[0],
      topConditions,
      appointmentTrend,
      coinsUsage:      coinsUsage[0],
    };

    await cacheSet(cacheKey, result, 900); // 15-min cache
    return result;
  }

  async getEmployees(corporateId: number, page = 1, limit = 20, query?: string) {
    const skip   = (page - 1) * limit;
    const filter = query ? `%${query}%` : null;

    return this.prisma.$queryRaw<any[]>`
      SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber",
             u."employeeId", u.status, u."createdAt",
             uw.current_balance AS coins_balance
      FROM users u
      LEFT JOIN user_wallets uw ON uw.user_id = u.id
      WHERE u."corporateId" = ${corporateId}
        ${filter ? `AND (u."firstName" ILIKE ${filter} OR u."lastName" ILIKE ${filter} OR u.email ILIKE ${filter})` : ''}
      ORDER BY u."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;
  }

  async addHealthPlan(corporateId: number, data: {
    planName:       string;
    coverageAmount: number;
    annualLimit:    number;
    features:       string[];
    validFrom:      string;
    validUntil:     string;
  }) {
    return this.prisma.$queryRaw<any[]>`
      INSERT INTO corporate_plan_sponsorships
        (corporate_id, plan_name, coverage_amount, annual_limit,
         features, valid_from, valid_until, status)
      VALUES (
        ${corporateId}, ${data.planName}, ${data.coverageAmount},
        ${data.annualLimit}, ${JSON.stringify(data.features)}::jsonb,
        ${new Date(data.validFrom)}, ${new Date(data.validUntil)}, 'active'
      )
      RETURNING *
    `;
  }

  async getHealthPlans(corporateId: number) {
    return this.prisma.$queryRaw<any[]>`
      SELECT * FROM corporate_plan_sponsorships
      WHERE corporate_id = ${corporateId}
        AND status = 'active'
        AND valid_until >= CURRENT_DATE
      ORDER BY valid_from DESC
    `;
  }
}
