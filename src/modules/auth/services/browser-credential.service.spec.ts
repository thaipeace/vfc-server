import { Test, TestingModule } from '@nestjs/testing';
import { BrowserCredentialService } from './browser-credential.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BrowserCredentialService', () => {
  let service: BrowserCredentialService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      browserCredential: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrowserCredentialService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<BrowserCredentialService>(BrowserCredentialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create browser credential with 365 days TTL and return raw token', async () => {
      prismaMock.browserCredential.create.mockImplementation((args: any) => ({
        id: 'bc_123',
        ...args.data,
      }));

      const res = await service.create('user_123', '0988366412', 'Mozilla/5.0');
      expect(res.id).toBe('bc_123');
      expect(res.token).toBeDefined();
      expect(typeof res.token).toBe('string');
      expect(res.expiresAt).toBeInstanceOf(Date);
      expect(prismaMock.browserCredential.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user_123',
            phone: '0988366412',
            userAgent: 'Mozilla/5.0',
          }),
        }),
      );
    });
  });

  describe('validate', () => {
    it('should validate successfully when token hash, phone and expiry match', async () => {
      const rawToken = 'raw_token_secret_123';
      const hash = service.hashToken(rawToken);
      const futureDate = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

      prismaMock.browserCredential.findUnique.mockResolvedValue({
        id: 'bc_123',
        userId: 'user_123',
        phone: '0988366412',
        credentialHash: hash,
        expiresAt: futureDate,
      });
      prismaMock.browserCredential.update.mockResolvedValue({});

      const res = await service.validate('bc_123', rawToken, '0988366412');
      expect(res.valid).toBe(true);
      expect(res.userId).toBe('user_123');
      expect(prismaMock.browserCredential.update).toHaveBeenCalled();
    });

    it('should return valid: false if token hash does not match', async () => {
      const futureDate = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);
      prismaMock.browserCredential.findUnique.mockResolvedValue({
        id: 'bc_123',
        userId: 'user_123',
        phone: '0988366412',
        credentialHash: 'some_other_hash',
        expiresAt: futureDate,
      });

      const res = await service.validate('bc_123', 'wrong_token', '0988366412');
      expect(res.valid).toBe(false);
    });

    it('should return valid: false if credential has expired', async () => {
      const rawToken = 'raw_token_secret_123';
      const hash = service.hashToken(rawToken);
      const pastDate = new Date(Date.now() - 1000);

      prismaMock.browserCredential.findUnique.mockResolvedValue({
        id: 'bc_123',
        userId: 'user_123',
        phone: '0988366412',
        credentialHash: hash,
        expiresAt: pastDate,
      });

      const res = await service.validate('bc_123', rawToken, '0988366412');
      expect(res.valid).toBe(false);
    });

    it('should return valid: false if phone does not match', async () => {
      const rawToken = 'raw_token_secret_123';
      const hash = service.hashToken(rawToken);
      const futureDate = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

      prismaMock.browserCredential.findUnique.mockResolvedValue({
        id: 'bc_123',
        userId: 'user_123',
        phone: '0988366412',
        credentialHash: hash,
        expiresAt: futureDate,
      });

      const res = await service.validate('bc_123', rawToken, '0912345678');
      expect(res.valid).toBe(false);
    });
  });

  describe('revoke', () => {
    it('should delete credential by id', async () => {
      prismaMock.browserCredential.delete.mockResolvedValue({});
      await service.revoke('bc_123');
      expect(prismaMock.browserCredential.delete).toHaveBeenCalledWith({
        where: { id: 'bc_123' },
      });
    });
  });
});
