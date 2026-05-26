import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantsController],
  providers: [TenantsService, JwtAuthGuard, SuperAdminGuard],
})
export class TenantsModule {}
