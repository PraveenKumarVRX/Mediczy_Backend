import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';

@Injectable()
export class LabsService {
  constructor(private readonly prisma: PrismaService) {}

  async searchLabs(filters: { city?: string; nablOnly?: boolean; homeCollection?: boolean; page: number; limit: number }) {
    const where: any = { isActive: true };
    if (filters.city)           where.city         = { contains: filters.city, mode: 'insensitive' };
    if (filters.nablOnly)       where.nablAccredited = true;
    if (filters.homeCollection) where.homeCollection = true;

    const [data, total] = await Promise.all([
      this.prisma.lab.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        select: { id: true, name: true, city: true, nablAccredited: true, homeCollection: true, phone: true },
        orderBy: [{ nablAccredited: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.lab.count({ where }),
    ]);
    return { data, total, page: filters.page, limit: filters.limit };
  }

  async getLabTests(labId: number, category?: string) {
    await this.prisma.lab.findUniqueOrThrow({ where: { id: labId } });
    return this.prisma.labTest.findMany({
      where: { labId, isActive: true, ...(category ? { category } : {}) },
      orderBy: { testName: 'asc' },
    });
  }

  async createOrder(patientId: number, orgId: number, data: {
    labId:   number;
    tests:   { testId: number; name: string }[];
    doctorId?: number;
    scheduledAt?: string;
  }) {
    const totalAmount = await this.prisma.labTest.aggregate({
      where: { id: { in: data.tests.map(t => t.testId) } },
      _sum:  { price: true },
    });

    const order = await this.prisma.labOrder.create({
      data: {
        patientId,
        labId:          data.labId,
        doctorId:       data.doctorId,
        organizationId: orgId,
        tests:          data.tests,
        status:         'pending',
        scheduledAt:    data.scheduledAt ? new Date(data.scheduledAt) : null,
        totalAmount:    totalAmount._sum.price,
      },
    });

    await publishEvent(KAFKA_TOPICS.LAB_ORDER_CREATED, {
      orderId: order.id, labId: data.labId, patientId, orgId,
    }).catch(() => {});

    return order;
  }

  async getOrder(orderId: number, requestingUserId: number) {
    const order = await this.prisma.labOrder.findUnique({ where: { id: orderId }, include: { lab: true } });
    if (!order) throw new NotFoundException(`Lab order ${orderId} not found`);
    return order;
  }

  async updateOrderResult(orderId: number, results: object, reportUrl?: string) {
    const order = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        results,
        reportUrl,
        status:      'completed',
        completedAt: new Date(),
      },
    });

    await publishEvent(KAFKA_TOPICS.LAB_RESULT_READY, { orderId, patientId: order.patientId }).catch(() => {});
    return order;
  }
}
