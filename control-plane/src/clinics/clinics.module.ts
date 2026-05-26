import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clinic } from './clinic.entity';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic])],
  controllers: [ClinicsController],
  providers: [ClinicsService, JwtAuthGuard, SuperAdminGuard],
})
export class ClinicsModule {}
