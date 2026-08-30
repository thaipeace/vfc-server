import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from './services/jwt.service';
import { UserResolverService } from './services/user-resolver.service';
import { ChallengeService } from './services/challenge.service';
import { ZaloOtpService } from './services/zalo-otp.service';
import { TelegramOtpService } from './services/telegram-otp.service';
import { BrowserCredentialService } from './services/browser-credential.service';
import { SseConnectionService } from './services/sse-connection.service';
import { OtpDeliveryOrchestratorService } from './services/otp-delivery-orchestrator.service';
import { Role } from '@prisma/client';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let userResolverMock: any;
  let challengeServiceMock: any;
  let jwtServiceMock: any;
  let zaloOtpMock: any;
  let telegramOtpMock: any;
  let browserCredentialMock: any;
  let sseConnectionMock: any;
  let orchestratorMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    userResolverMock = {
      isPhoneAuthorized: jest.fn().mockResolvedValue(true),
      resolveUser: jest.fn().mockResolvedValue({
        id: 'u1',
        phone: '0988366412',
        role: Role.FARMER,
        name: 'Nguyễn Văn A',
      }),
    };

    challengeServiceMock = {
      checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
      createChallenge: jest.fn().mockResolvedValue({
        challengeId: 'c123',
        otp: '1111',
      }),
      verifyChallenge: jest.fn().mockResolvedValue({
        valid: true,
        phone: '0988366412',
      }),
    };

    jwtServiceMock = {
      signToken: jest.fn().mockResolvedValue('mock_jwt_token_123'),
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'u1',
        phone: '0988366412',
        role: Role.FARMER,
      }),
    };

    zaloOtpMock = {
      sendOtp: jest.fn().mockResolvedValue(true),
    };

    telegramOtpMock = {
      sendOtp: jest.fn().mockResolvedValue(true),
    };

    browserCredentialMock = {
      validate: jest.fn().mockResolvedValue({ valid: true, userId: 'u1' }),
      create: jest.fn().mockResolvedValue({
        id: 'bc_123',
        token: 'raw_token_xyz',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }),
    };

    sseConnectionMock = {
      addConnection: jest.fn(),
      removeConnection: jest.fn(),
      isConnectionActive: jest.fn().mockReturnValue(true),
      sendEvent: jest.fn().mockReturnValue(true),
    };

    orchestratorMock = {
      dispatch: jest.fn().mockResolvedValue({
        method: 'sse',
        message: 'Mã xác thực gửi qua SSE.',
      }),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          phone: '0988366412',
          role: Role.FARMER,
          name: 'Nguyễn Văn A',
          isActive: true,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: UserResolverService, useValue: userResolverMock },
        { provide: ChallengeService, useValue: challengeServiceMock },
        { provide: ZaloOtpService, useValue: zaloOtpMock },
        { provide: TelegramOtpService, useValue: telegramOtpMock },
        { provide: BrowserCredentialService, useValue: browserCredentialMock },
        { provide: SseConnectionService, useValue: sseConnectionMock },
        { provide: OtpDeliveryOrchestratorService, useValue: orchestratorMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('events (SSE)', () => {
    it('should register connection with SseConnectionService and handle close', () => {
      const mockRes: any = {};
      let closeHandler: any;
      const mockReq: any = {
        on: jest.fn((event, handler) => {
          if (event === 'close') closeHandler = handler;
        }),
      };

      controller.events(mockRes, mockReq, '0988366412');
      expect(sseConnectionMock.addConnection).toHaveBeenCalledWith(
        expect.any(String),
        mockRes,
        '0988366412',
      );
      expect(mockReq.on).toHaveBeenCalledWith('close', expect.any(Function));

      // Trigger close
      closeHandler();
      expect(sseConnectionMock.removeConnection).toHaveBeenCalledWith(
        expect.any(String),
      );
    });
  });

  describe('requestOtp', () => {
    it('should create challenge, check credential, and dispatch via orchestrator', async () => {
      const res = await controller.requestOtp({
        phone: '0988366412',
        credentialId: 'bc_123',
        credentialToken: 'raw_token_xyz',
        connectionId: 'conn_123',
      });
      expect(res.success).toBe(true);
      expect(res.challengeId).toBe('c123');
      expect(res.method).toBe('sse');
      expect(res.hasValidCredential).toBe(true);
      expect(browserCredentialMock.validate).toHaveBeenCalledWith(
        'bc_123',
        'raw_token_xyz',
        '0988366412',
      );
      expect(challengeServiceMock.createChallenge).toHaveBeenCalledWith(
        '0988366412',
      );
      expect(orchestratorMock.dispatch).toHaveBeenCalledWith({
        phone: '0988366412',
        otp: '1111',
        challengeId: 'c123',
        connectionId: 'conn_123',
        hasValidCredential: true,
      });
    });

    it('should throw BAD_REQUEST if phone is invalid', async () => {
      await expect(controller.requestOtp({ phone: '123' })).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw FORBIDDEN if phone is not authorized', async () => {
      userResolverMock.isPhoneAuthorized.mockResolvedValue(false);
      await expect(
        controller.requestOtp({ phone: '0988366412' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('verifyOtp', () => {
    it('should verify challenge and return JWT token, user info and browserCredential', async () => {
      const res = await controller.verifyOtp(
        {
          challengeId: 'c123',
          otp: '1111',
        },
        'Mozilla/5.0',
      );

      expect(res.success).toBe(true);
      expect(res.token).toBe('mock_jwt_token_123');
      expect(res.user.id).toBe('u1');
      expect(res.browserCredential).toBeDefined();
      expect(res.browserCredential?.id).toBe('bc_123');
      expect(browserCredentialMock.create).toHaveBeenCalledWith(
        'u1',
        '0988366412',
        'Mozilla/5.0',
      );
      expect(jwtServiceMock.signToken).toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED if verifyChallenge returns invalid', async () => {
      challengeServiceMock.verifyChallenge.mockResolvedValue({
        valid: false,
        reason: 'INVALID_OTP',
      });

      await expect(
        controller.verifyOtp({ challengeId: 'c123', otp: '9999' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getMe', () => {
    it('should return user info when valid bearer token is provided', async () => {
      const res = await controller.getMe('Bearer mock_jwt_token_123');
      expect(res.success).toBe(true);
      expect(res.user.id).toBe('u1');
      expect(res.user.phone).toBe('0988366412');
    });

    it('should throw UNAUTHORIZED if header is missing or malformed', async () => {
      await expect(controller.getMe(undefined)).rejects.toThrow(HttpException);
      await expect(controller.getMe('Basic 123')).rejects.toThrow(
        HttpException,
      );
    });
  });
});
