import { Test, TestingModule } from '@nestjs/testing';
import { ChallengeService } from './challenge.service';
import { OtpService } from './otp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpChallengeStatus } from '@prisma/client';

describe('ChallengeService', () => {
  let service: ChallengeService;
  let prismaMock: any;
  let otpServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      otpRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    otpServiceMock = {
      generateOtp: jest.fn().mockReturnValue('1111'),
      hashOtp: jest.fn().mockResolvedValue('hashed_1111'),
      verifyOtpHash: jest.fn((plain, hash) => plain === '1111' && hash === 'hashed_1111'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChallengeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OtpService, useValue: otpServiceMock },
      ],
    }).compile();

    service = module.get<ChallengeService>(ChallengeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkRateLimit', () => {
    it('should allow request if no recent OTPs', async () => {
      prismaMock.otpRequest.findFirst.mockResolvedValue(null);
      prismaMock.otpRequest.count.mockResolvedValue(0);

      const result = await service.checkRateLimit('0988366412');
      expect(result.allowed).toBe(true);
    });

    it('should block with COOLDOWN if last request was less than 60s ago', async () => {
      const recentDate = new Date(Date.now() - 20 * 1000); // 20s ago
      prismaMock.otpRequest.findFirst.mockResolvedValue({ createdAt: recentDate });

      const result = await service.checkRateLimit('0988366412');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('COOLDOWN');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should block with RATE_LIMITED if >= 5 requests in 15 mins window', async () => {
      const oldDate = new Date(Date.now() - 80 * 1000); // 80s ago (> 60s cooldown)
      prismaMock.otpRequest.findFirst.mockResolvedValue({ createdAt: oldDate });
      prismaMock.otpRequest.count.mockResolvedValue(5);

      const result = await service.checkRateLimit('0988366412');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('RATE_LIMITED');
    });
  });

  describe('createChallenge', () => {
    it('should invalidate old challenges and create a new pending challenge', async () => {
      prismaMock.otpRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.otpRequest.create.mockResolvedValue({
        id: 'challenge_123',
        phone: '0988366412',
        status: OtpChallengeStatus.PENDING,
      });

      const result = await service.createChallenge('0988366412');
      expect(result.challengeId).toBe('challenge_123');
      expect(result.otp).toBe('1111');
      expect(prismaMock.otpRequest.updateMany).toHaveBeenCalled();
      expect(prismaMock.otpRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '0988366412',
            otp: 'hashed_1111',
            status: OtpChallengeStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('verifyChallenge', () => {
    it('should verify successfully when OTP matches and challenge is PENDING', async () => {
      const validFutureDate = new Date(Date.now() + 5 * 60 * 1000);
      prismaMock.otpRequest.findUnique.mockResolvedValue({
        id: 'challenge_123',
        phone: '0988366412',
        otp: 'hashed_1111',
        status: OtpChallengeStatus.PENDING,
        expiresAt: validFutureDate,
        attempts: 0,
      });
      prismaMock.otpRequest.update.mockResolvedValue({});

      const result = await service.verifyChallenge('challenge_123', '1111');
      expect(result.valid).toBe(true);
      expect(result.phone).toBe('0988366412');
      expect(prismaMock.otpRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'challenge_123' },
          data: expect.objectContaining({
            verified: true,
            status: OtpChallengeStatus.VERIFIED,
          }),
        }),
      );
    });

    it('should return error when challengeId does not exist', async () => {
      prismaMock.otpRequest.findUnique.mockResolvedValue(null);

      const result = await service.verifyChallenge('unknown_id', '1111');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('CHALLENGE_NOT_FOUND');
    });

    it('should return error when OTP is incorrect and increment attempts', async () => {
      const validFutureDate = new Date(Date.now() + 5 * 60 * 1000);
      prismaMock.otpRequest.findUnique.mockResolvedValue({
        id: 'challenge_123',
        phone: '0988366412',
        otp: 'hashed_1111',
        status: OtpChallengeStatus.PENDING,
        expiresAt: validFutureDate,
        attempts: 1,
      });
      prismaMock.otpRequest.update.mockResolvedValue({});

      const result = await service.verifyChallenge('challenge_123', '9999');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_OTP');
      expect(prismaMock.otpRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'challenge_123' },
          data: expect.objectContaining({
            attempts: 2,
            status: OtpChallengeStatus.PENDING,
          }),
        }),
      );
    });
  });
});
