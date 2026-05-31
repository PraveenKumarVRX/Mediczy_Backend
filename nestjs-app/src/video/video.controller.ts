import {
  Controller, Get, Post, Delete, Param, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VideoService } from './video.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

class JoinRoomDto {
  @ApiProperty({ enum: ['patient','doctor','observer'], default: 'patient' })
  @IsEnum(['patient','doctor','observer'])
  @IsOptional()
  userRole?: 'patient' | 'doctor' | 'observer';
}

@ApiTags('Video Consultation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/video')
export class VideoController {
  constructor(private readonly service: VideoService) {}

  @Post('appointments/:id/room')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a video consultation room for an appointment' })
  async createRoom(
    @Param('id', ParseIntPipe) appointmentId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.createRoom(appointmentId, userId);
  }

  @Post('appointments/:id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get LiveKit token to join a consultation room' })
  async joinRoom(
    @Param('id', ParseIntPipe) appointmentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: JoinRoomDto,
  ) {
    return this.service.joinRoom(appointmentId, userId, dto.userRole || 'patient');
  }

  @Get('appointments/:id/status')
  @ApiOperation({ summary: 'Get room status and participant count' })
  async status(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRoomStatus(id);
  }

  @Delete('appointments/:id/room')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End and delete a consultation room' })
  async endRoom(
    @Param('id', ParseIntPipe) appointmentId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.endRoom(appointmentId, userId);
  }
}
