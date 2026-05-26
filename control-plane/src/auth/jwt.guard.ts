import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('unauthorized token');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.get('JWT_SECRET'),
      });
      req['user'] = payload;
    } catch {
      throw new UnauthorizedException('unauthorized token');
    }
    return true;
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return (req.cookies?.token as string) ?? null;
  }
}
