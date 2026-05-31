import {
  Controller, Get, Post, Patch, Param, Body, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InsuranceService } from './insurance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId } from '../common/decorators/org-id.decorator';

class AddPolicyDto {
  @ApiProperty() @IsString() insurerName:  string;
  @ApiProperty() @IsString() policyNumber: string;
  @ApiProperty() @IsString() coverageType: string;
  @ApiProperty() @IsNumber() sumInsured:   number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() premium?: number;
  @ApiProperty() @IsString() startDate:    string;
  @ApiProperty() @IsString() endDate:      string;
}

class SubmitClaimDto {
  @ApiProperty() @IsNumber() policyId:    number;
  @ApiProperty() @IsString() claimType:   string;
  @ApiProperty() @IsNumber() claimAmount: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() diagnosisCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsArray()  documents?:     any[];
}

class UpdateClaimStatusDto {
  @ApiProperty() @IsString() status: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() approvedAmount?:    number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() rejectionReason?:   string;
}

@ApiTags('Insurance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/insurance')
export class InsuranceController {
  constructor(private readonly service: InsuranceService) {}

  @Get('policies')
  @ApiOperation({ summary: 'Get my insurance policies' })
  async getMyPolicies(@CurrentUser('id') userId: number) {
    return this.service.getMyPolicies(userId);
  }

  @Post('policies')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an insurance policy' })
  async addPolicy(@CurrentUser('id') userId: number, @Body() dto: AddPolicyDto) {
    return this.service.addPolicy(userId, dto);
  }

  @Post('claims')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an insurance claim' })
  async submitClaim(
    @CurrentUser('id') userId: number,
    @OrgId() orgId: number,
    @Body() dto: SubmitClaimDto,
  ) {
    return this.service.submitClaim(userId, orgId, dto);
  }

  @Get('claims')
  @ApiOperation({ summary: 'Get my insurance claims' })
  async getMyClaims(@CurrentUser('id') userId: number) {
    return this.service.getMyClaims(userId);
  }

  @Get('claims/:id')
  @ApiOperation({ summary: 'Get a specific claim' })
  async getClaim(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('isAdmin') isAdmin: boolean,
  ) {
    return this.service.getClaim(id, userId, isAdmin);
  }

  @Patch('claims/:id/status')
  @Roles('insurer_admin','tpa_admin','system_admin')
  @ApiOperation({ summary: 'Update claim status (insurer/TPA admin)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClaimStatusDto,
  ) {
    return this.service.updateClaimStatus(id, dto.status, dto.approvedAmount, dto.rejectionReason);
  }

  @Get('eligibility')
  @ApiOperation({ summary: 'Check insurance eligibility for a procedure' })
  async checkEligibility(
    @CurrentUser('id') userId: number,
    @Query('hospitalId', ParseIntPipe) hospitalId: number,
    @Query('procedureCode') procedureCode: string,
  ) {
    return this.service.checkEligibility(userId, hospitalId, procedureCode);
  }
}
