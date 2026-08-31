import { Test, TestingModule } from '@nestjs/testing';
import {
  OtpDeliveryOrchestratorService,
  FALLBACK_TIMEOUT_MS,
} from './otp-delivery-orchestrator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SseConnectionService } from './sse-connection.service';
import { ZaloOtpService } from './zalo-otp.service';
import { TelegramOtpService } from './telegram-otp.service';
import { OtpChallengeStatus } from '@prisma/client';

describe('OtpDeliveryOrchestratorService', () => {
  let service: OtpDeliveryOrchestratorService;
  let prismaMock: any;
  let sseServiceMock: any;
  let zaloOtpMock: any;
  let telegramOtpMock: any;

  beforeEach(async () => {
    jest.useFakeTimers();

    prismaMock = {
      otpRequest: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
    };

    sseServiceMock = {
      bindPhone: jest.fn(),
      isConnectionActive: jest.fn(),
      sendEvent: jest.fn().mockReturnValue(true),
    };

    zaloOtpMock = {
      sendOtp: jest.fn().mockResolvedValue(true),
    };

    telegramOtpMock = {
      sendOtp: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpDeliveryOrchestratorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SseConnectionService, useValue: sseServiceMock },
        { provide: ZaloOtpService, useValue: zaloOtpMock },
        { provide: TelegramOtpService, useValue: telegramOtpMock },
      ],
    }).compile();

    service = module.get<OtpDeliveryOrchestratorService>(
      OtpDeliveryOrchestratorService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dispatch - Unified secure flow', () => {
    it('should dispatch Zalo & Telegram and schedule timed SSE fallback', async () => {
      sseServiceMock.isConnectionActive.mockReturnValue(true);

      const res = await service.dispatch({
        phone: '0988366412',
        otp: '1234',
        challengeId: 'c123',
        connectionId: 'conn_abc',
        hasValidCredential: true,
      });

      expect(res.method).toBe('zalo+telegram');
      expect(zaloOtpMock.sendOtp).toHaveBeenCalledWith('0988366412', '1234');
      expect(telegramOtpMock.sendOtp).toHaveBeenCalledWith(
        '0988366412',
        '1234',
      );
      expect(sseServiceMock.sendEvent).not.toHaveBeenCalled();

      // Trigger timer
      prismaMock.otpRequest.findUnique.mockResolvedValue({
        id: 'c123',
        status: OtpChallengeStatus.PENDING,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      jest.advanceTimersByTime(service.getFallbackTimeoutMs());
      await Promise.resolve(); // Flush microtasks

      expect(prismaMock.otpRequest.findUnique).toHaveBeenCalledWith({
        where: { id: 'c123' },
      });
      expect(sseServiceMock.sendEvent).toHaveBeenCalledWith(
        'conn_abc',
        'otp_fallback',
        expect.objectContaining({ otp: '1234', type: 'otp_fallback' }),
      );
      expect(prismaMock.otpRequest.update).toHaveBeenCalledWith({
        where: { id: 'c123' },
        data: { deliveryMethod: 'sse_fallback' },
      });
    });

    it('should NOT send SSE fallback if challenge is already VERIFIED', async () => {
      sseServiceMock.isConnectionActive.mockReturnValue(true);

      await service.dispatch({
        phone: '0988366412',
        otp: '1234',
        challengeId: 'c123',
        connectionId: 'conn_abc',
        hasValidCredential: false,
      });

      // User verified already before fallback
      prismaMock.otpRequest.findUnique.mockResolvedValue({
        id: 'c123',
        status: OtpChallengeStatus.VERIFIED,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      jest.advanceTimersByTime(service.getFallbackTimeoutMs());
      await Promise.resolve();

      expect(sseServiceMock.sendEvent).not.toHaveBeenCalled();
    });
  });
});
