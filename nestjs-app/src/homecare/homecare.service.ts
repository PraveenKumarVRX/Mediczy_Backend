import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';

@Injectable()
export class HomecareService {
  constructor(private readonly prisma: PrismaService) {}

  async searchServices(filters: {
    city?: string; serviceType?: string;
    page: number; limit: number;
  }) {
    return this.prisma.$queryRaw<any[]>`
      SELECT hs.id, hs.service_name, hs.service_type, hs.description,
             hs.price_per_visit, hs.duration_hours, hs.requires_prescription,
             h.name AS provider_name, h.city
      FROM homecare_services hs
      JOIN homecare h ON h.id = hs.homecare_id
      WHERE hs.is_active = TRUE
        ${filters.city        ? `AND h.city ILIKE '%${filters.city}%'`        : ''}
        ${filters.serviceType ? `AND hs.service_type = '${filters.serviceType}'` : ''}
      ORDER BY h.name
      LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}
    `;
  }

  async bookVisit(patientId: number, orgId: number, data: {
    serviceId:    number;
    address:      string;
    lat:          number;
    lng:          number;
    scheduledDate: string;
    scheduledTime: string;
    notes?:       string;
  }) {
    const [booking] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO homecare_visits
        (patient_id, organization_id, service_id, address,
         scheduled_lat, scheduled_lng, scheduled_date, scheduled_time,
         notes, status, booked_at)
      VALUES (
        ${patientId}, ${orgId}, ${data.serviceId}, ${data.address},
        ${data.lat}, ${data.lng},
        ${new Date(data.scheduledDate)}, ${data.scheduledTime},
        ${data.notes || null}, 'scheduled', NOW()
      )
      RETURNING *
    `;

    await publishEvent(KAFKA_TOPICS.APPOINTMENT_BOOKED, {
      type:        'homecare',
      bookingId:   booking.id,
      patientId,
      date:        data.scheduledDate,
      time:        data.scheduledTime,
    }).catch(() => {});

    return booking;
  }

  async getMyVisits(patientId: number, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    return this.prisma.$queryRaw<any[]>`
      SELECT hv.*, hs.service_name, hs.service_type, hs.price_per_visit,
             h.name AS provider_name
      FROM homecare_visits hv
      JOIN homecare_services hs ON hs.id = hv.service_id
      JOIN homecare h ON h.id = hs.homecare_id
      WHERE hv.patient_id = ${patientId}
      ORDER BY hv.scheduled_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  async updateVisitStatus(visitId: number, status: string, notes?: string) {
    const [visit] = await this.prisma.$queryRaw<any[]>`
      UPDATE homecare_visits
      SET status = ${status},
          ${status === 'completed' ? 'completed_at = NOW(),' : ''}
          notes = COALESCE(${notes || null}, notes),
          updated_at = NOW()
      WHERE id = ${visitId}
      RETURNING *
    `;
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }
}
