import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramOtpService {
  private readonly logger = new Logger(TelegramOtpService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Gửi mã OTP qua Telegram Bot
   */
  async sendOtp(
    phone: string,
    otp: string,
    customChatId?: string,
  ): Promise<boolean> {
    const botToken =
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') ||
      process.env.TELEGRAM_BOT_TOKEN;
    const chatId =
      customChatId ||
      this.configService.get<string>('TELEGRAM_CHAT_ID') ||
      process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      this.logger.warn(
        `Telegram botToken hoặc chatId chưa được cấu hình. Bỏ qua gửi Telegram OTP cho ${phone}.`,
      );
      return false;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const message = `[VFC OTP] Mã xác thực đăng nhập của số điện thoại (${phone}) là: ${otp}. Vui lòng không chia sẻ mã này cho bất kỳ ai.`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      });

      if (response.ok) {
        this.logger.log(
          `[Telegram OTP Success] Sent OTP for ${phone} to Chat ID ${chatId}`,
        );
        return true;
      }

      const errData = await response.text();
      this.logger.error(`Telegram API Error: ${errData}`);
      return false;
    } catch (error: any) {
      this.logger.error(
        `Telegram OTP Exception for ${phone}: ${error?.message}`,
        error?.stack,
      );
      return false;
    }
  }
}
