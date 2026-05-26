import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  async adminLogin(email: string, password: string, clientIP: string) {
    if (!email || !password) throw new BadRequestException('Email and password are required');

    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isAdmin && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'platform_admin') {
      const superAdminEmails = ['admin@mediczy.com', 'superadmin@mediczy.com', this.cfg.get('SUPER_ADMIN_EMAIL')].filter(Boolean);
      if (!superAdminEmails.includes(user.email)) {
        throw new UnauthorizedException('Admin access required');
      }
    }

    await this.users.update(user.id, { lastLoginAt: new Date() });

    const token = this.jwt.sign({
      id: user.id,
      adminId: user.id,
      email: user.email,
      role: 'admin',
      userType: 'admin',
      isAdmin: true,
      loginTime: new Date().toISOString(),
      clientIP,
    });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        role: 'admin',
        userType: 'admin',
        isAdmin: true,
        lastLogin: user.lastLoginAt,
        permissions: [
          'user_management', 'doctor_management', 'nurse_management',
          'corporate_management', 'health_risk_management', 'analytics_access',
          'system_settings', 'bulk_operations', 'audit_logs', 'tenant_management',
        ],
      },
    };
  }
}
