import { Module } from '@nestjs/common';
import { JwtService } from './services/jwt.service';
import { OtpService } from './services/otp.service';
import { UserResolverService } from './services/user-resolver.service';

@Module({
  providers: [JwtService, OtpService, UserResolverService],
  exports: [JwtService, OtpService, UserResolverService],
})
export class AuthModule {}
