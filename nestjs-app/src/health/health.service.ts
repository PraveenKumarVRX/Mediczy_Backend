import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cacheGet, cacheSet } from '../../../server/config/redis-hardened.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Health Readings ────────────────────────────────────────────────────────

  async addReading(userId: number, orgId: number, data: {
    readingType: string; value: number; unit: string;
    source?: string; deviceId?: string; recordedAt?: string; metadata?: any;
  }) {
    return this.prisma.healthReading.create({
      data: {
        userId, organizationId: orgId,
        readingType: data.readingType,
        value:       data.value,
        unit:        data.unit,
        source:      data.source || 'manual',
        deviceId:    data.deviceId,
        recordedAt:  data.recordedAt ? new Date(data.recordedAt) : new Date(),
        metadata:    data.metadata || {},
      },
    });
  }

  async getReadings(userId: number, readingType?: string, days = 30) {
    return this.prisma.healthReading.findMany({
      where: {
        userId,
        ...(readingType ? { readingType } : {}),
        recordedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async getReadingsSummary(userId: number) {
    const cacheKey = `health:summary:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const summary = await this.prisma.$queryRaw<any[]>`
      SELECT
        reading_type AS type,
        COUNT(*)     AS count,
        AVG(value)   AS avg_value,
        MIN(value)   AS min_value,
        MAX(value)   AS max_value,
        MAX(recorded_at) AS last_reading
      FROM health_readings
      WHERE user_id = ${userId}
        AND recorded_at >= NOW() - INTERVAL '30 days'
      GROUP BY reading_type
      ORDER BY last_reading DESC
    `;

    await cacheSet(cacheKey, summary, 300); // 5-min cache
    return summary;
  }

  // ── Wallet / Health Coins ──────────────────────────────────────────────────

  async getWalletBalance(userId: number) {
    const cacheKey = `wallet:balance:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const wallet = await this.prisma.$queryRaw<any[]>`
      SELECT current_balance, total_earned, total_spent, last_transaction_at
      FROM user_wallets WHERE user_id = ${userId}
    `;

    const result = wallet[0] || { current_balance: 0, total_earned: 0, total_spent: 0 };
    await cacheSet(cacheKey, result, 60); // 1-min cache
    return result;
  }

  async getTransactionHistory(userId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    return this.prisma.$queryRaw`
      SELECT t.*, w.user_id
      FROM health_coins_transactions t
      JOIN user_wallets w ON w.id = t.wallet_id
      WHERE w.user_id = ${userId}
      ORDER BY t.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  async creditCoins(userId: number, orgId: number, data: {
    amount: number; transactionType: string;
    description: string; referenceType?: string; referenceId?: string;
  }) {
    const wallet = await this.prisma.$queryRaw<any[]>`
      SELECT id, current_balance FROM user_wallets WHERE user_id = ${userId}
    `;
    if (!wallet.length) throw new NotFoundException('Wallet not found');

    const { id: walletId, current_balance: balanceBefore } = wallet[0];
    const balanceAfter = Number(balanceBefore) + data.amount;

    await this.prisma.$executeRaw`
      INSERT INTO health_coins_transactions
        (wallet_id, user_id, organization_id, transaction_type, amount,
         balance_before, balance_after, reference_type, reference_id, description)
      VALUES (
        ${walletId}, ${userId}, ${orgId}, ${data.transactionType},
        ${data.amount}, ${balanceBefore}, ${balanceAfter},
        ${data.referenceType || null}, ${data.referenceId || null}, ${data.description}
      )
    `;

    // Invalidate balance cache
    await cacheSet(`wallet:balance:${userId}`, null, 1);
    return { balance: balanceAfter, credited: data.amount };
  }

  // ── Lookup Values ──────────────────────────────────────────────────────────

  async getLookupValues(category: string, tenantId?: number) {
    const cacheKey = `lookup:${category}:${tenantId || 'global'}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const values = await this.prisma.$queryRaw<any[]>`
      SELECT code, label, label_hi, sort_order, icon_code, color_code
      FROM lookup_values
      WHERE category = ${category}
        AND is_active = TRUE
        AND (tenant_id IS NULL OR tenant_id = ${tenantId || null})
      ORDER BY sort_order, label
    `;

    await cacheSet(cacheKey, values, 3600); // 1-hour cache
    return values;
  }
}
