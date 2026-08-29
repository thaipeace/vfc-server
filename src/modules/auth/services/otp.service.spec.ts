import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OtpService],
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

  it('should return fixed 1111 for dev bypass phones (09883664xx)', () => {
    expect(service.isDevBypassPhone('0988366412')).toBe(true);
    expect(service.generateOtp('0988366412')).toBe('1111');
    expect(service.generateOtp('84988366499')).toBe('1111');
    expect(service.generateOtp('+84988366400')).toBe('1111');
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
