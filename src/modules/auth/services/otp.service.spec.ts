import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn().mockReturnValue('development'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate a 4-digit numeric OTP for normal phones', () => {
    const otp = service.generateOtp('0912345678');
    expect(otp).toHaveLength(4);
    expect(/^\d{4}$/.test(otp)).toBe(true);
  });

  it('should return fixed 1111 for dev bypass phones (09883664xx) in dev mode', () => {
    expect(service.isDevBypassPhone('0988366412')).toBe(true);
    expect(service.generateOtp('0988366412')).toBe('1111');
    expect(service.generateOtp('84988366499')).toBe('1111');
    expect(service.generateOtp('+84988366400')).toBe('1111');
  });

  it('should NOT bypass for dev phones when in production mode', () => {
    configServiceMock.get.mockReturnValue('production');
    expect(service.isDevBypassPhone('0988366412')).toBe(false);
    expect(service.isDevBypassPhone('84988366499')).toBe(false);
    const otp = service.generateOtp('0988366412');
    expect(otp).toHaveLength(4);
    expect(/^\d{4}$/.test(otp)).toBe(true);
  });

  it('should hash and verify OTP correctly with bcrypt', async () => {
    const plainOtp = '4829';
    const hashed = await service.hashOtp(plainOtp);

    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(plainOtp);

    const isMatch = await service.verifyOtpHash(plainOtp, hashed);
    expect(isMatch).toBe(true);

    const isWrong = await service.verifyOtpHash('9999', hashed);
    expect(isWrong).toBe(false);
  });
});
