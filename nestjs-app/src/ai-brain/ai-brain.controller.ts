import {
  Controller, Post, Get, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiBrainService } from './ai-brain.service';

class AiChatDto {
  @ApiProperty() @IsString() message: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString()  forceAgent?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsArray()   contextMessages?: any[];
  @ApiProperty({ required: false }) @IsOptional()              conversationId?: number;
}

@ApiTags('AI Brain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/ai')
export class AiBrainController {
  constructor(private readonly aiService: AiBrainService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send message to multi-agent AI system (HAIS routing)' })
  async chat(
    @CurrentUser() user: any,
    @Body() dto: AiChatDto,
  ) {
    return this.aiService.chat({
      message:         dto.message,
      userId:          user.id,
      role:            user.role,
      orgId:           user.organizationId,
      isAdmin:         user.isAdmin,
      forceAgent:      dto.forceAgent,
      contextMessages: dto.contextMessages || [],
      conversationId:  dto.conversationId,
    });
  }

  @Get('agents')
  @ApiOperation({ summary: 'List available AI agents for current user role' })
  async listAgents(@CurrentUser() user: any) {
    return this.aiService.getAvailableAgents(user);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get AI usage stats for current organization' })
  async getUsage(@CurrentUser() user: any) {
    return this.aiService.getUsageStats(user.organizationId);
  }
}
