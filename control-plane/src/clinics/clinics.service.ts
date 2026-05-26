import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';

@Injectable()
export class ClinicsService {
  constructor(@InjectRepository(Clinic) private repo: Repository<Clinic>) {}

  async findAll(q: { page?: number; limit?: number; status?: string; search?: string }) {
    const { page = 1, limit = 20, status, search } = q;
    const qb = this.repo.createQueryBuilder('c').orderBy('c.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    if (status) qb.andWhere('c.status = :status', { status });
    if (search) qb.andWhere('(c.name ILIKE :s OR c.email ILIKE :s)', { s: `%${search}%` });
    const [clinics, total] = await qb.getManyAndCount();
    return { success: true, clinics, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const clinic = await this.repo.findOneBy({ id });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return { success: true, clinic };
  }

  async update(id: number, data: Partial<Clinic>, by: string) {
    const clinic = await this.repo.findOneBy({ id });
    if (!clinic) throw new NotFoundException('Clinic not found');
    await this.repo.update(id, data as any);
    return { success: true, message: 'Clinic updated' };
  }

  async remove(id: number) {
    const clinic = await this.repo.findOneBy({ id });
    if (!clinic) throw new NotFoundException('Clinic not found');
    await this.repo.delete(id);
    return { success: true, message: 'Clinic deleted' };
  }

  getPendingRegistrations(q: { page?: number; limit?: number }) {
    return this.findAll({ ...q, status: 'pending' });
  }

  approveRegistration(id: number, by: string) {
    return this.update({ id } as any, { status: 'active' } as any, by);
  }

  async rejectRegistration(id: number, reason: string, by: string) {
    const clinic = await this.repo.findOneBy({ id });
    if (!clinic) throw new NotFoundException('Clinic not found');
    await this.repo.update(id, { status: 'rejected' } as any);
    return { success: true, message: 'Clinic rejected' };
  }
}
