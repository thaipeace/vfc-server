import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtService } from './services/jwt.service';
import { OtpService } from './services/otp.service';
import { UserResolverService } from './services/user-resolver.service';
import { ZaloTokenService } from './services/zalo-token.service';
import { ZaloOtpService } from './services/zalo-otp.service';
import { TelegramOtpService } from './services/telegram-otp.service';
import { ChallengeService } from './services/challenge.service';
import { BrowserCredentialService } from './services/browser-credential.service';
import { SseConnectionService } from './services/sse-connection.service';
import { OtpDeliveryOrchestratorService } from './services/otp-delivery-orchestrator.service';

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
    BrowserCredentialService,
    SseConnectionService,
    OtpDeliveryOrchestratorService,
  ],
  exports: [
    JwtService,
    OtpService,
    UserResolverService,
    ZaloTokenService,
    ZaloOtpService,
    TelegramOtpService,
    ChallengeService,
    BrowserCredentialService,
    SseConnectionService,
    OtpDeliveryOrchestratorService,
  ],
})
export class AuthModule {}
