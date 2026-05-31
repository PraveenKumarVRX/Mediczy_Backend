import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number, select?: Prisma.UserSelect): Promise<Partial<User> | null> {
    return this.prisma.user.findUnique({ where: { id }, select: select as any });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async findByOrg(orgId: number, opts: { skip?: number; take?: number; status?: string } = {}) {
    return this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        ...(opts.status ? { status: opts.status as any } : {}),
      },
      skip: opts.skip ?? 0,
      take: opts.take ?? 20,
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phoneNumber: true, role: true, status: true, createdAt: true,
      },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: number, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async softDelete(id: number): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { status: 'deleted' } });
  }

  async search(query: string, orgId?: number): Promise<Partial<User>[]> {
    // Full-text search via DB-level tsvector trigger
    return this.prisma.$queryRaw`
      SELECT id, "firstName", "lastName", email, "phoneNumber", role, status
      FROM users
      WHERE search_vector @@ plainto_tsquery('english', ${query})
      ${orgId ? Prisma.sql`AND organization_id = ${orgId}` : Prisma.empty}
      LIMIT 20
    `;
  }

  async count(where: Prisma.UserWhereInput = {}): Promise<number> {
    return this.prisma.user.count({ where });
  }

  async getUserWithClinicalProfile(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        allergies:    { where: { severity: { not: 'UNKNOWN' } } },
        medications:  { where: { status: 'ACTIVE' } },
        conditions:   { where: { status: 'ACTIVE' } },
        familyMembers: true,
        vitalSigns:   { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
    });
  }
}
