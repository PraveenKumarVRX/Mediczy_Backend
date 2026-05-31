import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, AppointmentStatus } from '@prisma/client';

@Injectable()
export class AppointmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true } },
        doctor:  { select: { id: true, firstName: true, lastName: true, specialization: true } },
      },
    });
  }

  async findByDoctor(doctorId: number, from: Date, to: Date, status?: AppointmentStatus) {
    return this.prisma.appointment.findMany({
      where: {
        doctorId,
        appointmentDate: { gte: from, lte: to },
        ...(status ? { status } : {}),
      },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
      },
    });
  }

  async findByPatient(userId: number, opts: { page: number; limit: number }) {
    const skip = (opts.page - 1) * opts.limit;
    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { userId },
        orderBy: { appointmentDate: 'desc' },
        skip,
        take: opts.limit,
        include: {
          doctor: { select: { id: true, firstName: true, lastName: true, specialization: true, rating: true } },
        },
      }),
      this.prisma.appointment.count({ where: { userId } }),
    ]);
    return { data, total };
  }

  async findByOrg(orgId: number, date: Date) {
    return this.prisma.appointment.findMany({
      where: { organizationId: orgId, appointmentDate: date },
      orderBy: { appointmentTime: 'asc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor:  { select: { id: true, firstName: true, lastName: true, specialization: true } },
      },
    });
  }

  async create(data: Prisma.AppointmentCreateInput) {
    return this.prisma.appointment.create({ data, include: { doctor: true } });
  }

  async updateStatus(id: number, status: AppointmentStatus, reason?: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        ...(reason ? { cancellationReason: reason } : {}),
      },
    });
  }

  async countByOrgAndDate(orgId: number, date: Date): Promise<{ scheduled: number; completed: number; cancelled: number }> {
    const counts = await this.prisma.appointment.groupBy({
      by:     ['status'],
      where:  { organizationId: orgId, appointmentDate: date },
      _count: { id: true },
    });

    const result = { scheduled: 0, completed: 0, cancelled: 0 };
    for (const c of counts) {
      if (c.status in result) result[c.status as keyof typeof result] = c._count.id;
    }
    return result;
  }
}
