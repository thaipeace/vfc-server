import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ZaloTokenService } from './zalo-token.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ZaloTokenService', () => {
  let service: ZaloTokenService;
  let prismaMock: any;
  let configMock: any;

  beforeEach(async () => {
    prismaMock = {
      zaloAuthToken: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'ZALO_APP_ID') return 'mock_app_id';
        if (key === 'ZALO_APP_SECRET') return 'mock_app_secret';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZaloTokenService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<ZaloTokenService>(ZaloTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAccessToken', () => {
    it('should return access token from DB if still valid', async () => {
      const validFutureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      prismaMock.zaloAuthToken.findUnique.mockResolvedValue({
        id: 'default',
        accessToken: 'valid_access_token_123',
        refreshToken: 'valid_refresh_token_123',
        expiresAt: validFutureDate,
        enabled: true,
        refreshThresholdSeconds: 14400,
      });

      const token = await service.getAccessToken();
      expect(token).toBe('valid_access_token_123');
    });

    it('should throw error if no token record exists in DB', async () => {
      prismaMock.zaloAuthToken.findUnique.mockResolvedValue(null);

      await expect(service.getAccessToken()).rejects.toThrow(
        'Chưa có Zalo Token trong Database',
      );
    });

    it('should throw error if auth is disabled (enabled = false)', async () => {
      prismaMock.zaloAuthToken.findUnique.mockResolvedValue({
        id: 'default',
        accessToken: 'some_token',
        enabled: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.getAccessToken()).rejects.toThrow(
        'Chứng thực Zalo hiện đang bị TẮT',
      );
    });
  });

  describe('setRefreshThreshold', () => {
    it('should update refresh threshold when valid seconds provided', async () => {
      prismaMock.zaloAuthToken.upsert.mockResolvedValue({
        id: 'default',
        refreshThresholdSeconds: 7200,
      });

      const result = await service.setRefreshThreshold(7200);
      expect(result).toBe(7200);
      expect(prismaMock.zaloAuthToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'default' },
          update: { refreshThresholdSeconds: 7200 },
        }),
      );
    });

    it('should throw error when threshold is out of bounds (< 60s or > 86400s)', async () => {
      await expect(service.setRefreshThreshold(30)).rejects.toThrow(
        'Ngưỡng thời gian phải là số nguyên',
      );
      await expect(service.setRefreshThreshold(90000)).rejects.toThrow(
        'Ngưỡng thời gian phải là số nguyên',
      );
    });
  });

  describe('getTokenStatus', () => {
    it('should return configured: false if record not found', async () => {
      prismaMock.zaloAuthToken.findUnique.mockResolvedValue(null);
      const status = await service.getTokenStatus();
      expect(status.configured).toBe(false);
      expect(status.enabled).toBe(false);
    });

    it('should return masked tokens and alert level if configured', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      prismaMock.zaloAuthToken.findUnique.mockResolvedValue({
        id: 'default',
        accessToken: 'abcdef1234567890xyz',
        refreshToken: 'refresh1234567890xyz',
        expiresAt: futureDate,
        refreshTokenExpiresAt: futureDate,
        enabled: true,
        refreshThresholdSeconds: 14400,
      });

      const status = await service.getTokenStatus();
      expect(status.configured).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.accessTokenMasked).toBe('abcdef12...890xyz');
    });
  });
});
