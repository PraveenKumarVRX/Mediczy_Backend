import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub:        number;
  email:      string;
  role:       string;
  org_id:     number | null;
  org_type:   string | null;
  is_admin:   boolean;
  token_type: string;
  iat:        number;
  exp:        number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config:  ConfigService,
    private readonly prisma:  PrismaService,
  ) {
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      config.getOrThrow<string>('JWT_SECRET'),
      issuer:           'mediczy',
      audience:         'mediczy-api',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.token_type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where:  { id: payload.sub },
      select: {
        id: true, email: true, role: true,
        organizationId: true, organizationType: true,
        isAdmin: true, status: true,
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Account inactive or not found');
    }

    return {
      id:              user.id,
      email:           user.email,
      role:            user.role,
      organizationId:  user.organizationId,
      organizationType: user.organizationType,
      isAdmin:         user.isAdmin,
    };
  }
}
