import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ZaloOtpService } from './zalo-otp.service';
import { ZaloTokenService } from './zalo-token.service';

describe('ZaloOtpService', () => {
  let service: ZaloOtpService;
  let zaloTokenMock: any;
  let configMock: any;

  beforeEach(async () => {
    zaloTokenMock = {
      getAccessToken: jest.fn().mockResolvedValue('mock_access_token_123'),
    };

    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'ZALO_ZNS_TEMPLATE_ID') return 'mock_template_123';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZaloOtpService,
        { provide: ZaloTokenService, useValue: zaloTokenMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<ZaloOtpService>(ZaloOtpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should log and return true in non-production development mode without real send', async () => {
    const result = await service.sendOtp('0988366412', '1234');
    expect(result).toBe(true);
    expect(zaloTokenMock.getAccessToken).not.toHaveBeenCalled();
  });

  it('should call ZNS template API when forceRealSend is enabled and template_id configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ error: 0, message: 'Success' }),
    } as any);

    const result = await service.sendOtp(
      '0988366412',
      '1234',
      undefined,
      true, // forceRealSend
    );

    expect(result).toBe(true);
    expect(zaloTokenMock.getAccessToken).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://business.openapi.zalo.me/message/template',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          access_token: 'mock_access_token_123',
        }),
      }),
    );
  });
});
