import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Global environment config
    ConfigModule.forRoot({ isGlobal: true }),

    // Global Task Scheduling (Cron Jobs)
    ScheduleModule.forRoot(),

    // Structured logging with Pino
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),

    // Core Database, Health & Auth Modules
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
