import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloTokenService } from './zalo-token.service';

@Injectable()
export class ZaloOtpService {
  private readonly logger = new Logger(ZaloOtpService.name);

  constructor(
    private readonly zaloTokenService: ZaloTokenService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Gửi mã OTP qua Zalo (Ưu tiên ZNS template, fallback sang OA Message nếu có Zalo User ID)
   */
  async sendOtp(
    phone: string,
    otp: string,
    recipientId?: string,
    forceRealSend: boolean = false,
  ): Promise<boolean> {
    const isProd =
      (this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV) ===
      'production';

    if (!isProd && !forceRealSend) {
      this.logger.log(`[DEV MODE] Zalo OTP for ${phone}: ${otp}`);
      return true;
    }

    try {
      const token = await this.zaloTokenService.getAccessToken();
      const znsTemplateId =
        this.configService.get<string>('ZALO_ZNS_TEMPLATE_ID') ||
        process.env.ZALO_ZNS_TEMPLATE_ID;

      // 1. Nếu có cấu hình ZNS Template ID -> Gửi qua ZNS (gửi thẳng theo SĐT)
      if (znsTemplateId) {
        const formattedPhone = phone.replace(/^0/, '84');
        const response = await fetch(
          'https://business.openapi.zalo.me/message/template',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              access_token: token,
            },
            body: JSON.stringify({
              phone: formattedPhone,
              template_id: znsTemplateId,
              template_data: { otp, phone },
              tracking_id: `otp_${Date.now()}`,
            }),
          },
        );

        const result = await response.json();
        if (result.error === 0) {
          this.logger.log(`[Zalo ZNS Success] Sent OTP to ${formattedPhone}`);
          return true;
        }
        this.logger.warn(
          `[Zalo ZNS Failed], response: ${JSON.stringify(result)}. Trying OA Message fallback if recipientId provided...`,
        );
      }

      // 2. Gửi qua Zalo OA Message (Yêu cầu recipientId là Zalo User ID)
      if (recipientId) {
        const response = await fetch('https://openapi.zalo.me/v2.0/oa/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: token,
          },
          body: JSON.stringify({
            recipient: { user_id: recipientId },
            message: {
              text: `[VFC] Mã OTP của bạn (${phone}) là: ${otp}. Hết hạn sau 5 phút. Không chia sẻ mã này.`,
            },
          }),
        });

        const result = await response.json();
        if (result.error === 0) {
          this.logger.log(`[Zalo OA Message Success] Sent OTP to ${recipientId}`);
          return true;
        }

        this.logger.error(`[Zalo OA Message Failed]: ${JSON.stringify(result)}`);
        return false;
      }

      this.logger.warn(
        `Không thể gửi Zalo OTP cho ${phone}: Không có template_id ZNS hoặc không có recipientId OA.`,
      );
      return false;
    } catch (error: any) {
      this.logger.error(`Zalo OTP Exception: ${error?.message}`, error?.stack);
      return false;
    }
  }
}
