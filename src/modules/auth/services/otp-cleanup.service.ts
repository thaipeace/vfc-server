import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OtpCleanupService {
  private readonly logger = new Logger(OtpCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron Job chạy tự động lúc 02:00 sáng mỗi ngày:
   * Dọn dẹp các bản ghi OTP đã hết hạn quá 24 giờ để tránh phình to database (Table Bloat).
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailyOtpCleanup(): Promise<{ deletedOtpCount: number }> {
    this.logger.log('[OTP Cleanup Cron] Bắt đầu dọn dẹp các bản ghi OTP hết hạn...');

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Xóa tất cả các OTP được tạo hơn 24h trước hoặc đã hết hạn hơn 24h
      const result = await this.prisma.otpRequest.deleteMany({
        where: {
          OR: [
            { createdAt: { lt: oneDayAgo } },
            { expiresAt: { lt: oneDayAgo } },
          ],
        },
      });

      this.logger.log(
        `[OTP Cleanup Cron] Hoàn tất dọn dẹp: Đã xóa ${result.count} bản ghi OTP cũ.`,
      );

      return { deletedOtpCount: result.count };
    } catch (error: any) {
      this.logger.error(
        `[OTP Cleanup Cron] Lỗi khi dọn dẹp bản ghi OTP: ${error.message}`,
        error.stack,
      );
      return { deletedOtpCount: 0 };
    }
  }
}
