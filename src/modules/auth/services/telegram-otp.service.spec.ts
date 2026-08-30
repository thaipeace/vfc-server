import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramOtpService } from './telegram-otp.service';

describe('TelegramOtpService', () => {
  let service: TelegramOtpService;
  let configMock: any;

  beforeEach(async () => {
    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return 'mock_telegram_bot_token';
        if (key === 'TELEGRAM_CHAT_ID') return 'mock_telegram_chat_id';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramOtpService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<TelegramOtpService>(TelegramOtpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return false if bot token or chat id is missing', async () => {
    configMock.get.mockReturnValue(null);
    const result = await service.sendOtp('0988366412', '1234');
    expect(result).toBe(false);
  });

  it('should send telegram message successfully when configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true }),
    } as any);

    const result = await service.sendOtp('0988366412', '1234');
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botmock_telegram_bot_token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('1234'),
      }),
    );
  });
});
