import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (process.env.ALLOWED_ORIGINS || 'https://mediczy.in,https://www.mediczy.in,https://app.mediqzy.com')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Route control-plane APIs under /cp while preserving health probes at /live and /health.
  app.setGlobalPrefix(process.env.CONTROL_PLANE_PREFIX || 'cp', {
    exclude: ['health'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Control Plane API listening on :${port}`);
}
bootstrap();
