import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { AppointmentsRepository } from './repository/appointments.repository';
import { CreateAppointmentDto, UpdateAppointmentStatusDto } from './dto/create-appointment.dto';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';
import { dispatchEmergencyAlert } from '../../../server/config/queues.js';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private readonly repo: AppointmentsRepository) {}

  async findById(id: number) {
    const appt = await this.repo.findById(id);
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  async findByPatient(userId: number, page = 1, limit = 10) {
    const { data, total } = await this.repo.findByPatient(userId, { page, limit });
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findByDoctor(doctorId: number, from: Date, to: Date) {
    return this.repo.findByDoctor(doctorId, from, to);
  }

  async book(userId: number, orgId: number, orgType: string, dto: CreateAppointmentDto) {
    const existing = await this.repo.findByDoctor(
      dto.doctorId,
      new Date(dto.appointmentDate),
      new Date(dto.appointmentDate),
      'scheduled' as AppointmentStatus,
    );

    const conflict = existing.find(a => a.appointmentTime === dto.appointmentTime);
    if (conflict) throw new ConflictException('Time slot already booked');

    const appointment = await this.repo.create({
      userId,
      organizationId:   orgId,
      organizationType: orgType as any,
      doctorId:         dto.doctorId,
      doctorName:       dto.doctorName,
      patientName:      dto.patientName,
      patientPhone:     dto.patientPhone,
      patientEmail:     dto.patientEmail,
      appointmentDate:  new Date(dto.appointmentDate),
      appointmentTime:  dto.appointmentTime,
      consultationType: dto.consultationType as any,
      specialization:   dto.specialization,
      notes:            dto.notes,
    } as any);

    // Publish event (Kafka or in-memory fallback)
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_BOOKED, {
      appointmentId: appointment.id,
      doctorId:      dto.doctorId,
      patientId:     userId,
      orgId,
      date:          dto.appointmentDate,
      time:          dto.appointmentTime,
      type:          dto.consultationType,
    }, { key: String(orgId) }).catch(err =>
      this.logger.warn(`Kafka publish failed: ${err.message}`)
    );

    return appointment;
  }

  async updateStatus(id: number, dto: UpdateAppointmentStatusDto) {
    const appt = await this.findById(id);

    const updated = await this.repo.updateStatus(id, dto.status as AppointmentStatus, dto.reason);

    if (dto.status === 'completed') {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_COMPLETED, {
        appointmentId: id, doctorId: appt.doctorId, patientId: appt.userId,
      }).catch(() => {});
    }

    return updated;
  }

  async getDayStats(orgId: number, date: Date) {
    return this.repo.countByOrgAndDate(orgId, date);
  }
}
