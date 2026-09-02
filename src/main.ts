import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { GeoBlockGuard } from './common/guards/geo-block.guard';

// Suppress transient socket reset logs from DB idle connection drops
process.on('uncaughtException', (err: any) => {
  if (
    err?.code === 'ECONNRESET' ||
    err?.message?.includes('ECONNRESET') ||
    err?.syscall === 'read'
  ) {
    return;
  }
  console.error('[UncaughtException]', err);
});

process.on('unhandledRejection', (reason: any) => {
  if (
    reason?.code === 'ECONNRESET' ||
    reason?.message?.includes('ECONNRESET') ||
    reason?.syscall === 'read'
  ) {
    return;
  }
  console.error('[UnhandledRejection]', reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Enable CORS for frontend and API consumers
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Use Pino structured logger
  app.useLogger(app.get(Logger));

  // Global exception filter, interceptor and GeoBlock guard
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalGuards(new GeoBlockGuard());

  // Global prefix for all API routes (except root /)
  app.setGlobalPrefix('api/v1', {
    exclude: ['/'],
  });

  // Root endpoint for Render / Cloud health check
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (req: any, res: any) => {
    res.json({
      status: 'ok',
      service: 'vfc-server',
      docs: '/api/docs',
      health: '/api/v1/health',
      timestamp: new Date().toISOString(),
    });
  });
  expressApp.head('/', (req: any, res: any) => {
    res.status(200).end();
  });

  // Swagger OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('VFC Server — Core Backend & Auth API')
    .setDescription(
      'Core authentication service with Browser-Bound OTP, SSE real-time events, and unified user resolution',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('health')
    .addTag('auth')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 vfc-server running at http://localhost:${port}`);
  console.log(`📚 Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
