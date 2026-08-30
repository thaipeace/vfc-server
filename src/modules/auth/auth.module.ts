import { Module } from '@nestjs/common';
import { JwtService } from './services/jwt.service';
import { OtpService } from './services/otp.service';
import { UserResolverService } from './services/user-resolver.service';
import { ZaloTokenService } from './services/zalo-token.service';
import { ZaloOtpService } from './services/zalo-otp.service';
import { TelegramOtpService } from './services/telegram-otp.service';

@Module({
  providers: [
    JwtService,
    OtpService,
    UserResolverService,
    ZaloTokenService,
    ZaloOtpService,
    TelegramOtpService,
  ],
  exports: [
    JwtService,
    OtpService,
    UserResolverService,
    ZaloTokenService,
    ZaloOtpService,
    TelegramOtpService,
  ],
})
export class AuthModule {}
