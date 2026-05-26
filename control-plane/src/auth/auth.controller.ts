import { Controller, Post, Body, Req, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Controller('api/admin')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Req() req: Request,
  ) {
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    return this.svc.adminLogin(email, password, clientIP);
  }
}
