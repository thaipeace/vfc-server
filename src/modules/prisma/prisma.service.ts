import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    let connectionString = process.env.DATABASE_URL;
    if (connectionString && !connectionString.includes('uselibpqcompat=true')) {
      const separator = connectionString.includes('?') ? '&' : '?';
      connectionString = `${connectionString}${separator}uselibpqcompat=true`;
    }

    const pool = new Pool({
      connectionString,
      ssl: connectionString?.includes('neon.tech')
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Handle idle connection drops from Neon PgBouncer pooler gracefully
    pool.on('error', (err: any) => {
      if (
        err?.code === 'ECONNRESET' ||
        err?.message?.includes('ECONNRESET') ||
        err?.syscall === 'read'
      ) {
        return;
      }
      this.logger.error('Unexpected database pool error', err);
    });

    const adapter = new PrismaPg(pool as any);

    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development'
          ? ['error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL Database via Prisma');
    } catch (err: any) {
      this.logger.error('Failed to connect to Database on startup', err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from Database');
  }
}
