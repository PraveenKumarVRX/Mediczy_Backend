import {
  Controller, Get, Post, Patch, Param, Body, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId, Pagination } from '../common/decorators/org-id.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get my notifications' })
  async getMyNotifications(
    @CurrentUser('id') userId: number,
    @Pagination() pagination = { page: 1, limit: 20 },
  ) {
    return this.service.getMyNotifications(userId, pagination.page, pagination.limit);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser('id') userId: number) {
    return this.service.markRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.markRead(userId, id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@CurrentUser('id') userId: number) {
    return this.service.getPreferences(userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @CurrentUser('id') userId: number,
    @Body() prefs: Record<string, boolean>,
  ) {
    return this.service.updatePreferences(userId, prefs);
  }

  @Post('send')
  @HttpCode(HttpStatus.CREATED)
  @Roles('system_admin','hospital_admin','clinic_admin','doctor')
  @ApiOperation({ summary: 'Send a notification (admin/clinical staff only)' })
  async send(
    @OrgId() orgId: number,
    @Body() body: {
      userId:   number;
      type:     string;
      title:    string;
      message:  string;
      channels: string[];
      priority?: string;
    },
  ) {
    return this.service.send({ ...body, orgId, channels: body.channels as any, priority: body.priority as any });
  }
}
