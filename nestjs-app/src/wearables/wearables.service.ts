import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addJob, QUEUE_NAMES } from '../../../server/config/queues.js';

@Injectable()
export class WearablesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(userId: number, data: {
    deviceType:    string;
    deviceModel:   string;
    deviceSerial?: string;
    platform:      'ios' | 'android' | 'standalone';
  }) {
    return this.prisma.$queryRaw<any[]>`
      INSERT INTO wearables
        (user_id, device_type, device_model, device_serial, platform,
         is_active, registered_at)
      VALUES (
        ${userId}, ${data.deviceType}, ${data.deviceModel},
        ${data.deviceSerial || null}, ${data.platform},
        TRUE, NOW()
      )
      ON CONFLICT (user_id, device_serial) DO UPDATE
        SET device_model = EXCLUDED.device_model,
            is_active    = TRUE,
            updated_at   = NOW()
      RETURNING *
    `;
  }

  async getMyDevices(userId: number) {
    return this.prisma.$queryRaw<any[]>`
      SELECT id, device_type, device_model, device_serial, platform,
             is_active, last_sync_at, battery_level, registered_at
      FROM wearables
      WHERE user_id = ${userId} AND is_active = TRUE
      ORDER BY last_sync_at DESC NULLS LAST
    `;
  }

  async syncReadings(userId: number, deviceId: number, readings: {
    type:       string;
    value:      number;
    unit:       string;
    recordedAt: string;
  }[]) {
    // Bulk insert readings
    const inserted: any[] = [];
    for (const r of readings) {
      const [row] = await this.prisma.$queryRaw<any[]>`
        INSERT INTO health_readings
          (user_id, reading_type, value, unit, source, device_id, recorded_at)
        VALUES (
          ${userId}, ${r.type}, ${r.value}, ${r.unit},
          'wearable', ${String(deviceId)}, ${new Date(r.recordedAt)}
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `;
      if (row) inserted.push(row);
    }

    // Update last_sync_at on device
    await this.prisma.$executeRaw`
      UPDATE wearables SET last_sync_at = NOW() WHERE id = ${deviceId} AND user_id = ${userId}
    `;

    // Check for anomalies and dispatch alerts
    await this._checkAnomalies(userId, readings).catch(() => {});

    return { synced: inserted.length, total: readings.length };
  }

  private async _checkAnomalies(userId: number, readings: { type: string; value: number }[]) {
    const thresholds: Record<string, { min: number; max: number }> = {
      oxygen_saturation: { min: 92, max: 100 },
      heart_rate:        { min: 40, max: 180 },
      blood_glucose:     { min: 70, max: 250 },
    };

    for (const r of readings) {
      const t = thresholds[r.type];
      if (!t) continue;
      if (r.value < t.min || r.value > t.max) {
        const { dispatchEmergencyAlert } = await import('../../../server/config/queues.js');
        await dispatchEmergencyAlert({
          userId,
          alertType: `WEARABLE_ANOMALY_${r.type.toUpperCase()}`,
          severity:  r.value < t.min * 0.9 || r.value > t.max * 1.1 ? 'CRITICAL' : 'HIGH',
          orgId:     0,
          metadata:  { type: r.type, value: r.value, threshold: t },
        });
      }
    }
  }

  async getLatestReadings(userId: number) {
    return this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (reading_type)
        reading_type, value, unit, recorded_at, source
      FROM health_readings
      WHERE user_id = ${userId} AND source = 'wearable'
      ORDER BY reading_type, recorded_at DESC
    `;
  }
}
