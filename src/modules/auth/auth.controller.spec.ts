import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from './services/jwt.service';
import { UserResolverService } from './services/user-resolver.service';
import { ChallengeService } from './services/challenge.service';
import { ZaloOtpService } from './services/zalo-otp.service';
import { TelegramOtpService } from './services/telegram-otp.service';
import { Role } from '@prisma/client';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let userResolverMock: any;
  let challengeServiceMock: any;
  let jwtServiceMock: any;
  let zaloOtpMock: any;
  let telegramOtpMock: any;
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
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestOtp', () => {
    it('should create challenge and return method zalo+telegram for valid phone', async () => {
      const res = await controller.requestOtp({ phone: '0988366412' });
      expect(res.success).toBe(true);
      expect(res.challengeId).toBe('c123');
      expect(res.method).toBe('zalo+telegram');
      expect(challengeServiceMock.createChallenge).toHaveBeenCalledWith('0988366412');
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
    it('should verify challenge and return JWT token and user info', async () => {
      const res = await controller.verifyOtp({
        challengeId: 'c123',
        otp: '1111',
      });

      expect(res.success).toBe(true);
      expect(res.token).toBe('mock_jwt_token_123');
      expect(res.user.id).toBe('u1');
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
      await expect(controller.getMe('Basic 123')).rejects.toThrow(HttpException);
    });
  });
});
