import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { TenantsModule } from './tenants/tenants.module';
import { ClinicsModule } from './clinics/clinics.module';
import { AuthModule } from './auth/auth.module';
import { ProxyModule } from './proxy/proxy.module';
import { HealthController } from './health/health.controller';
import { RootController } from './root.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('POSTGRES_HOST', 'localhost'),
        port: cfg.get<number>('POSTGRES_PORT', 5432),
        database: cfg.get('POSTGRES_DATABASE', 'mediczy_prod'),
        username: cfg.get('POSTGRES_USER', 'postgres'),
        password: cfg.get('POSTGRES_PASSWORD'),
        ssl: cfg.get('POSTGRES_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        synchronize: false,
        logging: cfg.get('NODE_ENV') === 'development',
        extra: {
          max: cfg.get<number>('POSTGRES_POOL_MAX', 10),
          min: cfg.get<number>('POSTGRES_POOL_MIN', 2),
        },
      }),
    }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),

    TerminusModule,
    HttpModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*path}', '/', '/health'],
    }),
    AuthModule,
    TenantsModule,
    ClinicsModule,
    ProxyModule,
  ],
  controllers: [HealthController, RootController],
})
export class AppModule {}
