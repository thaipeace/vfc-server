import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';
import { getPhoneVariants } from '../../../common/utils/phone';
import { OtpChallengeStatus } from '@prisma/client';

export const OTP_TTL_MINUTES = 5;
export const MAX_ATTEMPTS = 5;
export const COOLDOWN_SECONDS = 60; // 60s cooldown giữa 2 lần yêu cầu
export const WINDOW_MINUTES = 15;
export const MAX_REQUESTS_PER_WINDOW = 5; // Tối đa 5 lần yêu cầu trong 15 phút

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: 'COOLDOWN' | 'RATE_LIMITED';
  message?: string;
  retryAfter?: number;
}

export interface VerifyChallengeResult {
  valid: boolean;
  phone?: string;
  reason?: string;
  message?: string;
}

@Injectable()
export class ChallengeService {
  private readonly logger = new Logger(ChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Kiểm tra giới hạn tần suất yêu cầu OTP cho SĐT
   */
  async checkRateLimit(phone: string): Promise<RateLimitCheckResult> {
    const variants = getPhoneVariants(phone);
    if (variants.length === 0) return { allowed: true };

    // 1. Kiểm tra Cooldown 60s từ lần yêu cầu gần nhất
    const latestOtp = await this.prisma.otpRequest.findFirst({
      where: { phone: { in: variants } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (latestOtp) {
      const elapsedSeconds = Math.floor(
        (Date.now() - latestOtp.createdAt.getTime()) / 1000,
      );
      if (elapsedSeconds < COOLDOWN_SECONDS) {
        const waitSeconds = COOLDOWN_SECONDS - elapsedSeconds;
        return {
          allowed: false,
          reason: 'COOLDOWN',
          message: `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu mã mới.`,
          retryAfter: waitSeconds,
        };
      }
    }

    // 2. Kiểm tra Rate Limit theo cửa sổ 15 phút
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
    const recentCount = await this.prisma.otpRequest.count({
      where: {
        phone: { in: variants },
        createdAt: { gte: windowStart },
      },
    });

    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
      return {
        allowed: false,
        reason: 'RATE_LIMITED',
        message: `Bạn đã yêu cầu gửi mã quá ${MAX_REQUESTS_PER_WINDOW} lần. Vui lòng thử lại sau ${WINDOW_MINUTES} phút.`,
        retryAfter: WINDOW_MINUTES * 60,
      };
    }

    return { allowed: true };
  }

  /**
   * Tạo challenge OTP mới cho SĐT và lưu vào database với status = PENDING
   */
  async createChallenge(
    phone: string,
    deliveryMethod: string = 'zalo+telegram',
  ): Promise<{ challengeId: string; otp: string }> {
    const variants = getPhoneVariants(phone);
    const plainOtp = this.otpService.generateOtp(phone);
    const hashedOtp = await this.otpService.hashOtp(plainOtp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Vô hiệu hóa các challenge cũ đang PENDING của số điện thoại này
    await this.prisma.otpRequest.updateMany({
      where: {
        phone: { in: variants },
        status: OtpChallengeStatus.PENDING,
      },
      data: {
        status: OtpChallengeStatus.EXPIRED,
        expiresAt: new Date(0),
      },
    });

    const record = await this.prisma.otpRequest.create({
      data: {
        phone,
        otp: hashedOtp,
        status: OtpChallengeStatus.PENDING,
        deliveryMethod,
        expiresAt,
        attempts: 0,
        verified: false,
      },
    });

    return {
      challengeId: record.id,
      otp: plainOtp,
    };
  }

  /**
   * Xác thực mã OTP người dùng nhập vào challengeId tương ứng
   */
  async verifyChallenge(
    challengeId: string,
    plainOtp: string,
  ): Promise<VerifyChallengeResult> {
    const record = await this.prisma.otpRequest.findUnique({
      where: { id: challengeId },
    });

    if (!record) {
      return {
        valid: false,
        reason: 'CHALLENGE_NOT_FOUND',
        message: 'Mã phiên xác thực không tồn tại. Vui lòng yêu cầu mã mới.',
      };
    }

    // Kiểm tra hết hạn hoặc trạng thái không còn PENDING
    const isExpired = record.expiresAt.getTime() < Date.now();
    if (record.status !== OtpChallengeStatus.PENDING || isExpired) {
      if (record.status === OtpChallengeStatus.PENDING && isExpired) {
        await this.prisma.otpRequest.update({
          where: { id: record.id },
          data: { status: OtpChallengeStatus.EXPIRED },
        });
      }
      return {
        valid: false,
        reason: 'OTP_EXPIRED',
        message: 'Mã OTP đã hết hạn hoặc phiên đã kết thúc. Vui lòng yêu cầu mã mới.',
      };
    }

    // Kiểm tra số lần thử
    if (record.attempts >= MAX_ATTEMPTS) {
      await this.prisma.otpRequest.update({
        where: { id: record.id },
        data: { status: OtpChallengeStatus.FAILED },
      });
      return {
        valid: false,
        reason: 'MAX_ATTEMPTS_EXCEEDED',
        message:
          'Bạn đã nhập sai quá số lần cho phép (5 lần). Vui lòng yêu cầu mã mới.',
      };
    }

    // So khớp mã băm
    const isMatch = await this.otpService.verifyOtpHash(plainOtp, record.otp);
    const newAttempts = record.attempts + 1;

    if (isMatch) {
      await this.prisma.otpRequest.update({
        where: { id: record.id },
        data: {
          attempts: newAttempts,
          verified: true,
          verifiedAt: new Date(),
          status: OtpChallengeStatus.VERIFIED,
        },
      });

      return {
        valid: true,
        phone: record.phone,
      };
    } else {
      const isFailed = newAttempts >= MAX_ATTEMPTS;
      await this.prisma.otpRequest.update({
        where: { id: record.id },
        data: {
          attempts: newAttempts,
          status: isFailed
            ? OtpChallengeStatus.FAILED
            : OtpChallengeStatus.PENDING,
        },
      });

      const remaining = MAX_ATTEMPTS - newAttempts;
      return {
        valid: false,
        reason: 'INVALID_OTP',
        message:
          remaining > 0
            ? `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.`
            : 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã mới.',
      };
    }
  }
}
