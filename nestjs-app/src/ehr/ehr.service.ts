import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';
import { maskPhi } from '../../../server/utils/phi-masker.js';

@Injectable()
export class EhrService {
  constructor(private readonly prisma: PrismaService) {}

  // ── EHR Records ──────────────────────────────────────────────────────────────

  async getPatientSummary(patientId: number, requesterId: number, requesterRole: string) {
    await this._assertAccess(patientId, requesterId, requesterRole);

    const [allergies, medications, conditions, recentVitals, labOrders] = await Promise.all([
      this.prisma.patientAllergy.findMany({
        where: { userId: patientId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patientMedication.findMany({
        where: { userId: patientId, status: 'ACTIVE' },
      }),
      this.prisma.patientCondition.findMany({
        where: { userId: patientId, status: 'ACTIVE' },
      }),
      this.prisma.vitalSign.findMany({
        where: { patientId },
        orderBy: { recordedAt: 'desc' },
        take: 5,
      }),
      this.prisma.labOrder.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { lab: { select: { name: true } } },
      }),
    ]);

    // Publish audit event (HIPAA §164.312(b) — Access audit trail)
    await publishEvent(KAFKA_TOPICS.EHR_ACCESSED, {
      patientId, accessedBy: requesterId, role: requesterRole,
    }).catch(() => {});

    return { allergies, medications, conditions, recentVitals, labOrders };
  }

  // ── Prescriptions ─────────────────────────────────────────────────────────

  async createPrescription(doctorId: number, orgId: number, data: {
    patientId:       number;
    appointmentId?:  number;
    diagnosis:       string;
    medications:     {
      name: string; dose: string; frequency: string;
      duration: string; instructions?: string;
    }[];
    notes?: string;
    followUpDate?: string;
  }) {
    const prescription = await this.prisma.$queryRaw<any[]>`
      INSERT INTO prescriptions
        ("patientId", "doctorId", "organizationId", diagnosis, medications, notes,
         "followUpDate", status, "createdAt", "updatedAt")
      VALUES (
        ${data.patientId}, ${doctorId}, ${orgId},
        ${data.diagnosis}, ${JSON.stringify(data.medications)}::jsonb,
        ${data.notes || null},
        ${data.followUpDate ? new Date(data.followUpDate) : null}::timestamptz,
        'active', NOW(), NOW()
      )
      RETURNING *
    `;

    await publishEvent(KAFKA_TOPICS.PRESCRIPTION_CREATED, {
      prescriptionId: prescription[0]?.id, patientId: data.patientId, doctorId, orgId,
    }).catch(() => {});

    return prescription[0];
  }

  async getPatientPrescriptions(patientId: number, requesterId: number, requesterRole: string) {
    await this._assertAccess(patientId, requesterId, requesterRole);

    return this.prisma.$queryRaw`
      SELECT p.*, u."firstName" || ' ' || u."lastName" AS doctor_name
      FROM prescriptions p
      LEFT JOIN users u ON u.id = p."doctorId"
      WHERE p."patientId" = ${patientId}
        AND p.status != 'deleted'
      ORDER BY p."createdAt" DESC
      LIMIT 50
    `;
  }

  // ── Vital Signs ────────────────────────────────────────────────────────────

  async recordVitals(patientId: number, recordedBy: number, orgId: number, vitals: {
    bloodPressureSystolic?:  number;
    bloodPressureDiastolic?: number;
    heartRate?:              number;
    temperature?:            number;
    oxygenSaturation?:       number;
    respiratoryRate?:        number;
    weight?:                 number;
    height?:                 number;
    bloodGlucose?:           number;
    notes?:                  string;
  }) {
    const record = await this.prisma.vitalSign.create({
      data: { patientId, recordedBy, organizationId: orgId, ...vitals } as any,
    });

    // Check for critical values and dispatch emergency alert if needed
    if (vitals.oxygenSaturation && vitals.oxygenSaturation < 90) {
      const { dispatchEmergencyAlert } = await import('../../../server/config/queues.js');
      await dispatchEmergencyAlert({
        userId:    patientId,
        alertType: 'LOW_OXYGEN_SATURATION',
        severity:  'CRITICAL',
        orgId,
        metadata:  { oxygenSaturation: vitals.oxygenSaturation },
      }).catch(() => {});
    }

    return record;
  }

  async getVitalsTrend(patientId: number, days = 30) {
    return this.prisma.vitalSign.findMany({
      where: {
        patientId,
        recordedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }

  // ── Access control ────────────────────────────────────────────────────────

  private async _assertAccess(patientId: number, requesterId: number, role: string) {
    const clinicalRoles = ['doctor','nurse','hospital_admin','clinic_admin','system_admin','lab_admin'];
    if (clinicalRoles.includes(role)) return; // clinical staff always have access
    if (patientId === requesterId) return;    // patient accessing own records
    throw new ForbiddenException('Access to this patient record is not permitted');
  }
}
