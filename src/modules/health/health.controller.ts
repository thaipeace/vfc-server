import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  async check() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }

    const isHealthy = dbStatus === 'ok';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'vfc-server',
      services: {
        database: dbStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
