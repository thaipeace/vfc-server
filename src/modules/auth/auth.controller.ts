import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Res,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from './services/jwt.service';
import { UserResolverService } from './services/user-resolver.service';
import { ChallengeService } from './services/challenge.service';
import { ZaloOtpService } from './services/zalo-otp.service';
import { TelegramOtpService } from './services/telegram-otp.service';
import { BrowserCredentialService } from './services/browser-credential.service';
import { SseConnectionService } from './services/sse-connection.service';
import { OtpDeliveryOrchestratorService } from './services/otp-delivery-orchestrator.service';
import { AuthRequestDto } from './dto/auth-request.dto';
import { AuthVerifyDto } from './dto/auth-verify.dto';
import {
  getPhoneVariants,
  isValidVietnamesePhone,
} from '../../common/utils/phone';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly userResolverService: UserResolverService,
    private readonly challengeService: ChallengeService,
    private readonly zaloOtpService: ZaloOtpService,
    private readonly telegramOtpService: TelegramOtpService,
    private readonly browserCredentialService: BrowserCredentialService,
    private readonly sseConnectionService: SseConnectionService,
    private readonly otpDeliveryOrchestratorService: OtpDeliveryOrchestratorService,
  ) {}

  /**
   * SSE Stream endpoint: Browser kết nối để nhận các sự kiện thời gian thực và mã OTP Toast
   */
  @Get('events')
  @ApiOperation({
    summary: 'SSE Endpoint để nhận các sự kiện và OTP real-time qua Server-Sent Events',
  })
  events(
    @Res() res: Response,
    @Req() req: Request,
    @Query('phone') phone?: string,
  ) {
    const connectionId = crypto.randomUUID();
    this.sseConnectionService.addConnection(connectionId, res, phone);

    req.on('close', () => {
      this.sseConnectionService.removeConnection(connectionId);
    });
  }

  /**
   * [UAT-ACCEPTED-GAP #1]
   * Yêu cầu gửi OTP: Điều phối thông minh giữa SSE trực tiếp (Returning User)
   * hoặc Zalo ZNS / Telegram Bot kèm 30s SSE Fallback (First Login / Unbound).
   */
  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu gửi mã xác thực OTP' })
  @ApiResponse({ status: 200, description: 'Tạo challenge OTP thành công' })
  @ApiResponse({ status: 400, description: 'Số điện thoại không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Số điện thoại chưa được cấp quyền' })
  @ApiResponse({ status: 429, description: 'Vượt quá giới hạn gửi mã' })
  async requestOtp(@Body() dto: AuthRequestDto) {
    const { phone } = dto;

    // 1. Kiểm tra định dạng SĐT Việt Nam
    if (!phone || !isValidVietnamesePhone(phone)) {
      throw new HttpException(
        {
          error: 'INVALID_PHONE',
          message: 'Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const phoneVariants = getPhoneVariants(phone);

    // 2. Kiểm tra số điện thoại có quyền đăng nhập hệ thống không
    const isAuthorized =
      await this.userResolverService.isPhoneAuthorized(phoneVariants);
    if (!isAuthorized) {
      throw new HttpException(
        {
          error: 'PHONE_NOT_AUTHORIZED',
          message:
            'Số điện thoại của bạn chưa được cấp quyền trong hệ thống VFC.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Kiểm tra Cooldown & Rate Limit
    const rateLimit = await this.challengeService.checkRateLimit(phone);
    if (!rateLimit.allowed) {
      throw new HttpException(
        {
          error: rateLimit.reason,
          message: rateLimit.message,
          retryAfter: rateLimit.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Kiểm tra xem browser có mang theo Browser Credential hợp lệ không
    let hasValidCredential = false;
    if (dto.credentialId && dto.credentialToken) {
      const credCheck = await this.browserCredentialService.validate(
        dto.credentialId,
        dto.credentialToken,
        phone,
      );
      hasValidCredential = credCheck.valid;
      this.logger.log(
        `Browser Credential check for ${phone}: ${
          hasValidCredential
            ? 'VALID (Returning User)'
            : 'INVALID/EXPIRED (First Login / Fallback)'
        }`,
      );
    }

    // 5. Tạo Challenge OTP mới
    const { challengeId, otp } =
      await this.challengeService.createChallenge(phone);

    // 6. Điều phối gửi OTP qua Orchestrator
    const dispatchResult =
      await this.otpDeliveryOrchestratorService.dispatch({
        phone,
        otp,
        challengeId,
        connectionId: dto.connectionId,
        hasValidCredential,
      });

    return {
      success: true,
      challengeId,
      method: dispatchResult.method,
      hasValidCredential,
      fallbackAfter: dispatchResult.fallbackAfter,
      message: dispatchResult.message,
    };
  }

  /**
   * [UAT-ACCEPTED-GAP #3]
   * Xác thực mã OTP, phát hành Bearer JWT Token và Browser Credential (365 ngày).
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực mã OTP và đăng nhập nhận JWT Token & Browser Credential' })
  @ApiResponse({ status: 200, description: 'Xác thực thành công, trả về JWT & Browser Credential' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Mã OTP không đúng hoặc hết hạn' })
  @ApiResponse({ status: 403, description: 'Người dùng không được phép đăng nhập' })
  async verifyOtp(
    @Body() dto: AuthVerifyDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    const { challengeId, otp } = dto;

    if (!challengeId || !otp || otp.length !== 4) {
      throw new HttpException(
        {
          error: 'INVALID_INPUT',
          message: 'Mã phiên xác thực và OTP 4 số là bắt buộc.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 1. Xác thực OTP trong challenge
    const result = await this.challengeService.verifyChallenge(
      challengeId,
      otp,
    );
    if (!result.valid || !result.phone) {
      throw new HttpException(
        {
          error: result.reason || 'VERIFICATION_FAILED',
          message: result.message || 'Xác thực mã OTP không thành công.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 2. Phân giải & liên kết người dùng
    const sessionToken = crypto.randomUUID();
    const phoneVariants = getPhoneVariants(result.phone);
    const user = await this.userResolverService.resolveUser(
      phoneVariants,
      result.phone,
      sessionToken,
    );

    if (!user) {
      throw new HttpException(
        {
          error: 'PHONE_NOT_AUTHORIZED',
          message: 'Không tìm thấy hoặc không thể khởi tạo tài khoản người dùng.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Ký Bearer JWT Token
    const token = await this.jwtService.signToken({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      sessionId: sessionToken,
    });

    // 4. Tạo Browser Credential mới cho thiết bị này (TTL 365 ngày)
    const browserCredential = await this.browserCredentialService.create(
      user.id,
      user.phone,
      userAgent,
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
      },
      browserCredential: {
        id: browserCredential.id,
        token: browserCredential.token,
        expiresAt: browserCredential.expiresAt,
      },
    };
  }

  /**
   * Lấy thông tin tài khoản đang đăng nhập từ Bearer JWT Header
   */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin người dùng từ JWT Token' })
  @ApiResponse({ status: 200, description: 'Thông tin tài khoản' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập hoặc Token hết hạn' })
  async getMe(@Headers('authorization') authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        {
          error: 'UNAUTHORIZED',
          message: 'Thiếu Authorization Bearer header.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const session = await this.jwtService.verifyToken(token);

    if (!session || !session.sub) {
      throw new HttpException(
        {
          error: 'INVALID_TOKEN',
          message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.sub },
      include: {
        profile: true,
        agency: true,
        farmer: true,
        mdo: true,
        se: true,
      },
    });

    if (!user || !user.isActive) {
      throw new HttpException(
        {
          error: 'USER_NOT_FOUND',
          message: 'Tài khoản không tồn tại hoặc đã bị khóa.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
        avatarUrl: user.avatarUrl,
        agency: user.agency,
        farmer: user.farmer,
        mdo: user.mdo,
        se: user.se,
        profile: user.profile,
      },
    };
  }

  /**
   * Đăng xuất người dùng: xóa sessionToken trong cơ sở dữ liệu
   */
  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất tài khoản' })
  async logout(@Headers('authorization') authHeader?: string) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const session = await this.jwtService.verifyToken(token);
      if (session?.sub) {
        await this.prisma.user
          .update({
            where: { id: session.sub },
            data: { sessionToken: null },
          })
          .catch(() => null);
      }
    }

    return {
      success: true,
      message: 'Đăng xuất thành công.',
    };
  }
}
