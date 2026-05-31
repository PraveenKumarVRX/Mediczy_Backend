import {
  Injectable, UnauthorizedException, ConflictException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  issueAccessToken,
  issueRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../../../server/services/auth-token.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  async login(email: string, password: string, deviceFingerprint = 'default') {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'active') throw new UnauthorizedException('Account is not active');

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });

    const accessToken  = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user, deviceFingerprint);

    this.logger.log(`Login: user=${user.id} role=${user.role}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id:               user.id,
        email:            user.email,
        firstName:        user.firstName,
        lastName:         user.lastName,
        role:             user.role,
        organizationId:   user.organizationId,
        organizationType: user.organizationType,
        isAdmin:          user.isAdmin,
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload = await validateRefreshToken(refreshToken);
    if (!payload) throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== 'active') {
      await revokeRefreshToken(refreshToken);
      throw new UnauthorizedException('Account inactive');
    }

    await revokeRefreshToken(refreshToken);

    const accessToken     = issueAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user, payload.fingerprint);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: number, refreshToken?: string, logoutAll = false) {
    if (logoutAll) {
      await revokeAllRefreshTokens(userId);
    } else if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return { success: true };
  }
}
