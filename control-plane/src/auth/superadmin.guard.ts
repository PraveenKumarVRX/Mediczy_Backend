import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SUPER_ADMIN_ROLES = new Set(['admin', 'super_admin', 'platform_admin']);

@Injectable()
export class SuperAdminGuard implements CanActivate {
  private superAdminEmails: string[];

  constructor(private cfg: ConfigService) {
    this.superAdminEmails = [
      'admin@mediczy.com',
      'superadmin@mediczy.com',
      cfg.get('SUPER_ADMIN_EMAIL'),
    ].filter(Boolean) as string[];
  }

  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest()['user'];
    if (!user) throw new ForbiddenException('Super admin access required');

    const isSuperAdmin =
      this.superAdminEmails.includes(user.email) ||
      SUPER_ADMIN_ROLES.has(user.role) ||
      user.isAdmin === true;

    if (!isSuperAdmin) {
      throw new ForbiddenException({
        error: 'Access denied. Super Admin privileges required.',
        currentRole: user.role,
        currentEmail: user.email,
      });
    }
    return true;
  }
}
