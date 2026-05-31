import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorsRepository } from './repository/doctors.repository';
import { SearchDoctorsDto, CreateScheduleDto } from './dto/doctor.dto';
import { acquireLock, releaseLock } from '../../../server/config/redis-hardened.js';

@Injectable()
export class DoctorsService {
  constructor(
    private readonly repo:   DoctorsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async search(dto: SearchDoctorsDto, orgId?: number) {
    const result = await this.repo.search({
      specialization: dto.specialization,
      city:           dto.city,
      onlineOnly:     dto.onlineOnly,
      query:          dto.query,
      orgId,
      page:           dto.page  || 1,
      limit:          dto.limit || 20,
    });
    return { ...result, page: dto.page || 1, limit: dto.limit || 20, pages: Math.ceil(result.total / (dto.limit || 20)) };
  }

  async findById(id: number) {
    const doctor = await this.repo.findById(id);
    if (!doctor) throw new NotFoundException(`Doctor ${id} not found`);
    return doctor;
  }

  async getAvailableSlots(doctorId: number, dateStr: string) {
    await this.findById(doctorId);
    return this.repo.getAvailableSlots(doctorId, new Date(dateStr));
  }

  async bookSlot(doctorId: number, slotId: string, sessionId: string) {
    // Atomic lock — prevents double-booking under concurrent requests
    const lockKey  = `slot:${slotId}`;
    const ownerId  = await acquireLock(lockKey, 10_000, sessionId);
    if (!ownerId) throw new ConflictException('Slot is being booked by someone else — try again');

    try {
      const [result] = await this.prisma.$queryRaw<[{ book_doctor_slot: boolean }]>`
        SELECT book_doctor_slot(${slotId}::uuid, ${sessionId}::uuid)
      `;
      if (!result.book_doctor_slot) throw new ConflictException('Slot is no longer available');
      return { booked: true, slotId };
    } finally {
      await releaseLock(lockKey, ownerId);
    }
  }

  async createSchedule(doctorId: number, dto: CreateScheduleDto) {
    return this.prisma.$executeRaw`
      INSERT INTO doctor_schedules
        (doctor_id, day_of_week, start_time, end_time,
         slot_duration_minutes, max_patients_per_slot,
         consultation_types, valid_from, valid_until)
      VALUES (
        ${doctorId}, ${dto.dayOfWeek},
        ${dto.startTime}::time, ${dto.endTime}::time,
        ${dto.slotDurationMinutes || 15}, ${dto.maxPatientsPerSlot || 1},
        ${dto.consultationTypes || ['in_person']}::text[],
        ${dto.validFrom ? new Date(dto.validFrom) : null}::date,
        ${dto.validUntil ? new Date(dto.validUntil) : null}::date
      )
      ON CONFLICT (doctor_id, day_of_week, start_time, valid_from) DO NOTHING
    `;
  }

  async generateSlots(doctorId: number, fromDate: string, toDate: string) {
    const [result] = await this.prisma.$queryRaw<[{ generate_doctor_slots: number }]>`
      SELECT generate_doctor_slots(${doctorId}, ${new Date(fromDate)}::date, ${new Date(toDate)}::date)
    `;
    return { slotsGenerated: result.generate_doctor_slots };
  }

  async setOnlineStatus(doctorId: number, isOnline: boolean) {
    return this.repo.setOnlineStatus(doctorId, isOnline);
  }
}
