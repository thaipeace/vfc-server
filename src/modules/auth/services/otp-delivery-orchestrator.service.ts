import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SseConnectionService } from './sse-connection.service';
import { ZaloOtpService } from './zalo-otp.service';
import { TelegramOtpService } from './telegram-otp.service';
import { OtpChallengeStatus } from '@prisma/client';

export const FALLBACK_TIMEOUT_MS = 30000; // 30 giây fallback mặc định (Production)
export const DEFAULT_FALLBACK_TIMEOUT_MS = FALLBACK_TIMEOUT_MS;

export interface DispatchOptions {
  phone: string;
  otp: string;
  challengeId: string;
  connectionId?: string;
  hasValidCredential?: boolean;
}

export interface DispatchResult {
  method: 'sse' | 'zalo+telegram';
  fallbackAfter?: number;
  message: string;
}

@Injectable()
export class OtpDeliveryOrchestratorService {
  private readonly logger = new Logger(OtpDeliveryOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseService: SseConnectionService,
    private readonly zaloOtpService: ZaloOtpService,
    private readonly telegramOtpService: TelegramOtpService,
  ) {}

  /**
   * Thời gian chờ Fallback (ms):
   * - Nếu cấu hình OTP_FALLBACK_TIMEOUT_MS trong .env -> dùng giá trị đó
   * - Môi trường development -> 3 giây (3000ms) để test nhanh
   * - Môi trường production -> 30 giây (30000ms)
   */
  getFallbackTimeoutMs(): number {
    if (process.env.OTP_FALLBACK_TIMEOUT_MS) {
      return parseInt(process.env.OTP_FALLBACK_TIMEOUT_MS, 10);
    }
    if (process.env.NODE_ENV === 'development') {
      return 3000;
    }
    return DEFAULT_FALLBACK_TIMEOUT_MS;
  }

  /**
   * Điều phối phân phối OTP thông minh:
   * 1. Returning user (có Browser Credential hợp lệ + kết nối SSE đang mở):
   *    -> Gửi OTP trực tiếp qua SSE Toast ngay lập tức (KHÔNG gọi Zalo/Telegram).
   * 2. First login (hoặc không có credential / mất credential):
   *    -> Gửi OTP qua Zalo ZNS + Telegram Bot song song.
   *    -> Kích hoạt hẹn giờ Fallback 30s: Nếu sau 30s user chưa xác thực, tự động bắn OTP qua SSE Toast.
   */
  async dispatch(options: DispatchOptions): Promise<DispatchResult> {
    const { phone, otp, challengeId, connectionId, hasValidCredential } =
      options;

    // Gắn SĐT với connectionId nếu có
    if (connectionId) {
      this.sseService.bindPhone(connectionId, phone);
    }

    const isSseReady =
      connectionId && this.sseService.isConnectionActive(connectionId);

    // ── CASE 1: RETURNING USER (Có Browser Credential hợp lệ + SSE mở) ──
    if (hasValidCredential && isSseReady) {
      this.logger.log(
        `[Orchestrator] Returning user ${phone} with active SSE connection ${connectionId}. Delivering OTP via SSE Toast immediately.`,
      );

      // Gửi OTP trực tiếp qua SSE
      this.sseService.sendEvent(connectionId, 'otp', {
        type: 'otp',
        otp,
        phone,
        challengeId,
        timestamp: Date.now(),
      });

      // Cập nhật phương thức gửi trong DB
      await this.prisma.otpRequest
        .update({
          where: { id: challengeId },
          data: { deliveryMethod: 'sse' },
        })
        .catch(() => null);

      return {
        method: 'sse',
        message: 'Mã xác thực OTP đã được gửi trực tiếp tới màn hình của bạn.',
      };
    }

    // ── CASE 2: FIRST LOGIN / FALLBACK FLOW (Zalo + Telegram + 30s SSE Fallback) ──
    this.logger.log(
      `[Orchestrator] First login / unverified browser for ${phone}. Delivering OTP via Zalo & Telegram with 30s SSE fallback.`,
    );

    // 1. Cập nhật phương thức trong DB
    await this.prisma.otpRequest
      .update({
        where: { id: challengeId },
        data: { deliveryMethod: 'zalo+telegram' },
      })
      .catch(() => null);

    // 2. Gửi OTP qua Zalo & Telegram song song
    Promise.allSettled([
      this.zaloOtpService.sendOtp(phone, otp),
      this.telegramOtpService.sendOtp(phone, otp),
    ]).catch((err) => {
      this.logger.error('Error dispatching Zalo/Telegram OTP', err);
    });

    const fallbackTimeoutMs = this.getFallbackTimeoutMs();
    const fallbackSeconds = Math.round(fallbackTimeoutMs / 1000);

    // 3. Kích hoạt hẹn giờ Fallback qua SSE
    if (connectionId) {
      this.scheduleSseFallbackTimer(
        challengeId,
        phone,
        otp,
        connectionId,
        fallbackTimeoutMs,
      );
    }

    return {
      method: 'zalo+telegram',
      fallbackAfter: fallbackSeconds,
      message: `Mã xác thực đã được gửi qua Zalo/Telegram. Nếu không nhận được, mã sẽ tự động hiển thị trên màn hình sau ${fallbackSeconds} giây.`,
    };
  }

  /**
   * Hẹn giờ để kiểm tra và gửi mã dự phòng qua SSE nếu user chưa nhận được Zalo
   */
  private scheduleSseFallbackTimer(
    challengeId: string,
    phone: string,
    otp: string,
    connectionId: string,
    timeoutMs: number,
  ): void {
    setTimeout(async () => {
      try {
        const challenge = await this.prisma.otpRequest.findUnique({
          where: { id: challengeId },
        });

        // Chỉ gửi fallback nếu challenge vẫn đang PENDING và chưa hết hạn
        if (
          challenge &&
          challenge.status === OtpChallengeStatus.PENDING &&
          challenge.expiresAt.getTime() > Date.now()
        ) {
          if (this.sseService.isConnectionActive(connectionId)) {
            this.logger.log(
              `[Orchestrator Fallback] ${Math.round(
                timeoutMs / 1000,
              )}s elapsed for ${phone}. Sending fallback OTP via SSE to ${connectionId}.`,
            );

            this.sseService.sendEvent(connectionId, 'otp_fallback', {
              type: 'otp_fallback',
              otp,
              phone,
              challengeId,
              timestamp: Date.now(),
            });

            await this.prisma.otpRequest
              .update({
                where: { id: challengeId },
                data: { deliveryMethod: 'sse_fallback' },
              })
              .catch(() => null);
          } else {
            this.logger.debug(
              `[Orchestrator Fallback] SSE connection ${connectionId} is no longer active. Skipping fallback.`,
            );
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed in SSE fallback timer for challenge ${challengeId}: ${err?.message}`,
        );
      }
    }, timeoutMs);
  }
}
