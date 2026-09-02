import { Test, TestingModule } from '@nestjs/testing';
import { OtpCleanupService } from './otp-cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('OtpCleanupService', () => {
  let service: OtpCleanupService;
  let prismaService: any;

  beforeEach(async () => {
    const prismaMock = {
      otpRequest: {
        deleteMany: jest.fn().mockResolvedValue({ count: 42 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpCleanupService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<OtpCleanupService>(OtpCleanupService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should clean up OTP records older than 24 hours', async () => {
    const result = await service.handleDailyOtpCleanup();

    expect(prismaService.otpRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { createdAt: { lt: expect.any(Date) } },
          { expiresAt: { lt: expect.any(Date) } },
        ],
      },
    });

    expect(result.deletedOtpCount).toBe(42);
  });

  it('should handle database errors gracefully without throwing', async () => {
    prismaService.otpRequest.deleteMany.mockRejectedValueOnce(
      new Error('DB Connection Timeout'),
    );

    const result = await service.handleDailyOtpCleanup();
    expect(result.deletedOtpCount).toBe(0);
  });
});
