import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtService } from './services/jwt.service';
import { OtpService } from './services/otp.service';
import { UserResolverService } from './services/user-resolver.service';
import { ZaloTokenService } from './services/zalo-token.service';
import { ZaloOtpService } from './services/zalo-otp.service';
import { TelegramOtpService } from './services/telegram-otp.service';
import { ChallengeService } from './services/challenge.service';

@Module({
  controllers: [AuthController],
  providers: [
    JwtService,
    OtpService,
    UserResolverService,
    ZaloTokenService,
    ZaloOtpService,
    TelegramOtpService,
    ChallengeService,
  ],
  exports: [
    JwtService,
    OtpService,
    UserResolverService,
    ZaloTokenService,
    ZaloOtpService,
    TelegramOtpService,
    ChallengeService,
  ],
})
export class AuthModule {}
