import {
  Controller, Get, Post, Patch, Param, Query, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId, Pagination } from '../common/decorators/org-id.decorator';

class DispenseDto {
  @ApiProperty() @IsInt()   prescriptionId: number;
  @ApiProperty() @IsInt()   patientId:      number;
  @ApiProperty() @IsArray() items: { inventoryId: number; quantity: number; unitPrice: number }[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

class StockAdjustmentDto {
  @ApiProperty() @IsNumber() adjustment: number;
  @ApiProperty() @IsString() reason:     string;
}

@ApiTags('Pharmacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/pharmacy')
export class PharmacyController {
  constructor(private readonly service: PharmacyService) {}

  @Public()
  @Get('drugs/search')
  @ApiOperation({ summary: 'Search drugs by name (generic or brand)' })
  async searchDrugs(
    @Query('q') q: string,
    @Pagination() p = { page: 1, limit: 20 },
  ) {
    return this.service.searchDrugs(q || '', p.page, p.limit);
  }

  @Get(':pharmacyId/inventory')
  @Roles('pharmacy_admin','system_admin')
  @ApiOperation({ summary: 'Get pharmacy inventory' })
  async getInventory(
    @Param('pharmacyId', ParseIntPipe) pharmacyId: number,
    @Query('lowStockOnly') lowStockOnly?: string,
  ) {
    return this.service.getInventory(pharmacyId, lowStockOnly === 'true');
  }

  @Get(':pharmacyId/expiry-alerts')
  @Roles('pharmacy_admin','system_admin')
  @ApiOperation({ summary: 'Get near-expiry stock alerts' })
  async expiryAlerts(
    @Param('pharmacyId', ParseIntPipe) pharmacyId: number,
    @Query('days', new ParseIntPipe({ optional: true })) days = 30,
  ) {
    return this.service.getExpiryAlerts(pharmacyId, days);
  }

  @Patch(':pharmacyId/inventory/:itemId/stock')
  @Roles('pharmacy_admin','system_admin')
  @ApiOperation({ summary: 'Adjust stock quantity (positive = restock, negative = write-off)' })
  async adjustStock(
    @Param('pharmacyId', ParseIntPipe) pharmacyId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: StockAdjustmentDto,
  ) {
    return this.service.updateStock(pharmacyId, itemId, dto.adjustment, dto.reason);
  }

  @Post(':pharmacyId/dispense')
  @HttpCode(HttpStatus.CREATED)
  @Roles('pharmacy_admin','system_admin')
  @ApiOperation({ summary: 'Dispense a prescription' })
  async dispense(
    @Param('pharmacyId', ParseIntPipe) pharmacyId: number,
    @CurrentUser('id') staffId: number,
    @Body() dto: DispenseDto,
  ) {
    return this.service.dispensePrescription(pharmacyId, staffId, dto);
  }

  @Get(':pharmacyId/dispensings')
  @Roles('pharmacy_admin','system_admin')
  @ApiOperation({ summary: 'Get dispensing history' })
  async dispensings(
    @Param('pharmacyId', ParseIntPipe) pharmacyId: number,
    @Pagination() p = { page: 1, limit: 20 },
  ) {
    return this.service.getDispensings(pharmacyId, p.page, p.limit);
  }
}
