import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class DoctorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(filters: {
    specialization?: string;
    city?:           string;
    onlineOnly?:     boolean;
    query?:          string;
    orgId?:          number;
    page:            number;
    limit:           number;
  }) {
    const where: Prisma.DoctorWhereInput = {
      status: 'active',
      ...(filters.orgId          ? { organizationId: filters.orgId }         : {}),
      ...(filters.specialization  ? { specialization: { contains: filters.specialization, mode: 'insensitive' } } : {}),
      ...(filters.onlineOnly      ? { isOnline: true }                       : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where,
        skip:    (filters.page - 1) * filters.limit,
        take:    filters.limit,
        select: {
          id: true, firstName: true, lastName: true, specialization: true,
          consultationFee: true, isOnline: true, isAvailable: true,
          rating: true, totalConsults: true, profileImage: true, bio: true,
        },
        orderBy: [{ isOnline: 'desc' }, { rating: 'desc' }],
      }),
      this.prisma.doctor.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: number) {
    return this.prisma.doctor.findUnique({ where: { id } });
  }

  async getAvailableSlots(doctorId: number, date: Date) {
    return this.prisma.$queryRaw<any[]>`
      SELECT id, slot_start, slot_end, consultation_type,
             max_bookings - current_bookings AS remaining,
             is_available
      FROM doctor_availability_slots
      WHERE doctor_id = ${doctorId}
        AND slot_date  = ${date}::date
        AND NOT is_blocked
      ORDER BY slot_start
    `;
  }

  async setOnlineStatus(doctorId: number, isOnline: boolean) {
    return this.prisma.doctor.update({
      where: { id: doctorId },
      data:  { isOnline },
    });
  }
}
