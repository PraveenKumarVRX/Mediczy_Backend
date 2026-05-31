import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { DoctorsModule } from './doctors/doctors.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { LabsModule } from './labs/labs.module';
import { InsuranceModule } from './insurance/insurance.module';
import { EhrModule } from './ehr/ehr.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TenantModule } from './tenant/tenant.module';
import { AiBrainModule } from './ai-brain/ai-brain.module';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    // Config (global, loads .env)
    ConfigModule.forRoot({
      isGlobal:  true,
      envFilePath: ['../.env', '../server/.env', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      name:  'default',
      ttl:   60_000,
      limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    }]),

    // Infrastructure
    PrismaModule,
    CommonModule,

    // Feature modules
    AuthModule,
    UsersModule,
    AppointmentsModule,
    DoctorsModule,
    HospitalsModule,
    LabsModule,
    InsuranceModule,
    EhrModule,
    HealthModule,
    NotificationsModule,
    TenantModule,
    AiBrainModule,
  ],
  providers: [
    // Global JWT guard — use @Public() decorator to bypass on specific routes
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global roles guard
    { provide: APP_GUARD, useClass: RolesGuard },
    // Global rate limiting guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
