import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bufferLogs: true,
  });

  // ── Security middleware ───────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https:'],
      },
    },
  }));
  app.use(compression());

  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',').map(s => s.trim()).filter(Boolean),
    credentials: true,
    methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  });

  // ── Global validation ─────────────────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist:            true,
    forbidNonWhitelisted: true,
    transform:            true,
    transformOptions:     { enableImplicitConversion: true },
    stopAtFirstError:     false,
  }));

  // ── Swagger API docs (dev/staging only) ──────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Mediczy API v2 — NestJS')
      .setDescription(`
Enterprise Healthcare SaaS — NestJS strangler-fig (runs on port 8001 alongside Express 8000).

**Modules implemented:**
- Auth (JWT 15min access + Redis refresh rotation)
- Users (register, profile, clinical summary, FTS search)
- Appointments (booking, scheduling, availability)
- Doctors (search, weekly schedules, atomic slot booking)
- Hospitals (search, dashboard)
- Labs (test catalogue, orders, results)
- Insurance (policies, claims, eligibility)
- EHR (patient summary, prescriptions, vitals with critical alert)
- Health (readings, wallet/coins, lookup values)
- Notifications (in-app, push, SMS, emergency dispatch)
- Tenant (provisioning, DEDICATED/SCHEMA/SHARED strategy, usage)
- AI Brain (HAIS cognitive routing, multi-agent, usage stats)
      `.trim())
      .setVersion('2.0.0')
      .addBearerAuth()
      .addTag('Auth')
      .addTag('Users')
      .addTag('Appointments')
      .addTag('Doctors')
      .addTag('Hospitals')
      .addTag('Labs')
      .addTag('Insurance')
      .addTag('EHR')
      .addTag('Health')
      .addTag('Notifications')
      .addTag('Tenant Management')
      .addTag('AI Brain')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    });

    logger.log('Swagger docs: http://localhost:8001/api/docs');
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = parseInt(process.env.NESTJS_PORT || '8001', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`NestJS running on port ${port} (${process.env.NODE_ENV || 'development'})`);
  logger.log(`Express still running on port ${process.env.PORT || 8000} (strangler-fig mode)`);
}

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
