import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser('id') userId: number) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMe(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, dto);
  }

  @Get('me/clinical-profile')
  @ApiOperation({ summary: 'Get patient clinical profile (allergies, meds, conditions, vitals)' })
  async getMyClinicalProfile(@CurrentUser('id') userId: number) {
    return this.usersService.getClinicalProfile(userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search users within organization' })
  @ApiQuery({ name: 'q', required: true })
  async search(
    @Query('q') query: string,
    @CurrentUser('organizationId') orgId: number,
  ) {
    return this.usersService.search(query, orgId);
  }

  @Get('org')
  @Roles('hospital_admin','clinic_admin','system_admin','corporate_admin')
  @ApiOperation({ summary: 'List users in organization (admin only)' })
  async listByOrg(
    @CurrentUser('organizationId') orgId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.usersService.findByOrg(orgId, page, Math.min(limit, 100));
  }

  @Get(':id')
  @Roles('hospital_admin','clinic_admin','system_admin','doctor','nurse')
  @ApiOperation({ summary: 'Get user by ID (clinical staff only)' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('system_admin')
  @ApiOperation({ summary: 'Soft-delete a user (system admin only)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.softDelete(id);
  }
}
