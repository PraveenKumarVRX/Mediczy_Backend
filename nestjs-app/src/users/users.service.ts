import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './repository/users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { maskPhi } from '../../../server/utils/phi-masker.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: number) {
    const user = await this.usersRepository.findById(id, {
      id: true, firstName: true, lastName: true, email: true,
      phoneNumber: true, role: true, organizationId: true,
      organizationType: true, status: true, createdAt: true,
      profileImage: true, isVerified: true, abhaHealthId: true,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async findByOrg(orgId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.usersRepository.findByOrg(orgId, { skip, take: limit }),
      this.usersRepository.count({ organizationId: orgId }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.usersRepository.create({
      ...dto,
      password:      passwordHash,
      email:         dto.email.toLowerCase().trim(),
    } as any);
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findById(id);
    const data = { ...dto } as any;
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
    }
    return this.usersRepository.update(id, data);
  }

  async getClinicalProfile(userId: number) {
    const profile = await this.usersRepository.getUserWithClinicalProfile(userId);
    if (!profile) throw new NotFoundException(`User ${userId} not found`);
    // Mask PHI before returning to non-clinical callers
    return maskPhi(profile);
  }

  async search(query: string, orgId?: number) {
    if (!query || query.trim().length < 2) return [];
    return this.usersRepository.search(query.trim(), orgId);
  }

  async softDelete(id: number) {
    await this.findById(id);
    return this.usersRepository.softDelete(id);
  }
}
