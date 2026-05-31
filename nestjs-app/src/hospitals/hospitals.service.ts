import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(filters: { city?: string; state?: string; query?: string; page: number; limit: number }) {
    const where: any = { isActive: true };
    if (filters.city)  where.city  = { contains: filters.city,  mode: 'insensitive' };
    if (filters.state) where.state = { contains: filters.state, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.hospital.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        select: {
          id: true, name: true, city: true, state: true,
          phone: true, registrationNumber: true, accreditations: true,
          specialties: true, totalBeds: true, latitude: true, longitude: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.hospital.count({ where }),
    ]);
    return { data, total, page: filters.page, limit: filters.limit, pages: Math.ceil(total / filters.limit) };
  }

  async findById(id: number) {
    const h = await this.prisma.hospital.findUnique({ where: { id } });
    if (!h) throw new NotFoundException(`Hospital ${id} not found`);
    return h;
  }

  async getDashboard(hospitalId: number, date: Date) {
    const [bedStats, appointmentCounts] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*)                                      AS total_beds,
          SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available
        FROM beds WHERE "hospitalId" = ${hospitalId}
      `,
      this.prisma.$queryRaw<any[]>`
        SELECT status, COUNT(*) AS count
        FROM appointments
        WHERE organization_id = ${hospitalId}
          AND "appointmentDate" = ${date}::date
        GROUP BY status
      `,
    ]);

    return {
      beds: bedStats[0] || { total_beds: 0, occupied: 0, available: 0 },
      appointments: Object.fromEntries(appointmentCounts.map(r => [r.status, Number(r.count)])),
    };
  }
}
