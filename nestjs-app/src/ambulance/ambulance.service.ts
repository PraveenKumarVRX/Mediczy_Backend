import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dispatchEmergencyAlert } from '../../../server/config/queues.js';

@Injectable()
export class AmbulanceService {
  constructor(private readonly prisma: PrismaService) {}

  async searchNearby(lat: number, lng: number, radiusKm = 10) {
    return this.prisma.$queryRaw<any[]>`
      SELECT a.id, a.name, a.phone, a.vehicle_type, a.is_available,
             a.current_lat, a.current_lng,
             earth_distance(
               ll_to_earth(${lat}, ${lng}),
               ll_to_earth(a.current_lat, a.current_lng)
             ) / 1000 AS distance_km
      FROM ambulances a
      WHERE a.is_available = TRUE
        AND a.current_lat IS NOT NULL
        AND earth_distance(
          ll_to_earth(${lat}, ${lng}),
          ll_to_earth(a.current_lat, a.current_lng)
        ) / 1000 <= ${radiusKm}
      ORDER BY distance_km
      LIMIT 10
    `;
  }

  async dispatchEmergency(requesterId: number, orgId: number, data: {
    patientName:  string;
    patientPhone: string;
    location:     { lat: number; lng: number; address: string };
    emergencyType: string;
    severity:      string;
    notes?:        string;
  }) {
    // Find nearest available ambulance
    const nearby = await this.searchNearby(data.location.lat, data.location.lng, 20);
    const assigned = nearby[0] || null;

    if (assigned) {
      // Mark ambulance as dispatched
      await this.prisma.$executeRaw`
        UPDATE ambulances SET is_available = FALSE, updated_at = NOW()
        WHERE id = ${assigned.id}
      `;
    }

    // Create emergency dispatch record
    const [dispatch] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO ambulance_dispatches
        (requester_id, organization_id, ambulance_id, patient_name, patient_phone,
         pickup_lat, pickup_lng, pickup_address, emergency_type,
         severity, notes, status, requested_at)
      VALUES (
        ${requesterId}, ${orgId}, ${assigned?.id || null},
        ${data.patientName}, ${data.patientPhone},
        ${data.location.lat}, ${data.location.lng}, ${data.location.address},
        ${data.emergencyType}, ${data.severity},
        ${data.notes || null}, ${assigned ? 'dispatched' : 'pending'}, NOW()
      )
      RETURNING *
    `;

    // Dispatch emergency alert to BullMQ emergency queue
    await dispatchEmergencyAlert({
      userId:    requesterId,
      alertType: `AMBULANCE_${data.emergencyType.toUpperCase()}`,
      severity:  data.severity,
      orgId,
      metadata:  { dispatchId: dispatch.id, ambulanceId: assigned?.id, ...data },
    }).catch(() => {});

    return { dispatch, assignedAmbulance: assigned };
  }

  async getDispatchStatus(dispatchId: number) {
    const [d] = await this.prisma.$queryRaw<any[]>`
      SELECT ad.*, a.vehicle_number, a.driver_name, a.driver_phone,
             a.current_lat, a.current_lng
      FROM ambulance_dispatches ad
      LEFT JOIN ambulances a ON a.id = ad.ambulance_id
      WHERE ad.id = ${dispatchId}
    `;
    if (!d) throw new NotFoundException(`Dispatch ${dispatchId} not found`);
    return d;
  }
}
