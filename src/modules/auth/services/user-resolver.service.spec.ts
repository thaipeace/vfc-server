import { Test, TestingModule } from '@nestjs/testing';
import { UserResolverService } from './user-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('UserResolverService', () => {
  let service: UserResolverService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      agency: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      farmer: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      mdo: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      se: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      userProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      crop: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserResolverService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<UserResolverService>(UserResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isPhoneAuthorized', () => {
    it('should return true if phone exists in user table', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
      prismaMock.agency.findFirst.mockResolvedValue(null);
      prismaMock.farmer.findFirst.mockResolvedValue(null);
      prismaMock.mdo.findFirst.mockResolvedValue(null);
      prismaMock.se.findFirst.mockResolvedValue(null);

      const result = await service.isPhoneAuthorized(['0988366412', '84988366412']);
      expect(result).toBe(true);
    });

    it('should return true if phone exists in agency table', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.agency.findFirst.mockResolvedValue({ id: 'ag1' });
      prismaMock.farmer.findFirst.mockResolvedValue(null);
      prismaMock.mdo.findFirst.mockResolvedValue(null);
      prismaMock.se.findFirst.mockResolvedValue(null);

      const result = await service.isPhoneAuthorized(['0988366412']);
      expect(result).toBe(true);
    });

    it('should return false if phone does not exist anywhere', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.agency.findFirst.mockResolvedValue(null);
      prismaMock.farmer.findFirst.mockResolvedValue(null);
      prismaMock.mdo.findFirst.mockResolvedValue(null);
      prismaMock.se.findFirst.mockResolvedValue(null);

      const result = await service.isPhoneAuthorized(['0988366412']);
      expect(result).toBe(false);
    });
  });

  describe('resolveUser', () => {
    it('should resolve and update existing user if found in users table', async () => {
      const existingUser = {
        id: 'u1',
        phone: '0988366412',
        role: Role.FARMER,
        name: 'Nguyễn Văn A',
      };
      prismaMock.user.findFirst.mockResolvedValue(existingUser);
      prismaMock.user.update.mockResolvedValue({
        ...existingUser,
        sessionToken: 'sess_123',
      });
      prismaMock.userProfile.findUnique.mockResolvedValue({ userId: 'u1' });

      const resolved = await service.resolveUser(
        ['0988366412'],
        '0988366412',
        'sess_123',
      );

      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe('u1');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ sessionToken: 'sess_123' }),
        }),
      );
    });

    it('should create new AGENCY user if not found in users but exists in agencies', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.agency.findFirst.mockResolvedValue({
        id: 'ag_1',
        name: 'Đại Lý ABC',
        phone: '0988366412',
        userId: null,
      });
      prismaMock.user.create.mockResolvedValue({
        id: 'new_u_agency',
        phone: '0988366412',
        role: Role.AGENCY,
        name: 'Đại Lý ABC',
        sessionToken: 'sess_123',
      });
      prismaMock.userProfile.findUnique.mockResolvedValue(null);
      prismaMock.userProfile.create.mockResolvedValue({ id: 'p1' });

      const resolved = await service.resolveUser(
        ['0988366412'],
        '0988366412',
        'sess_123',
      );

      expect(resolved).toBeDefined();
      expect(resolved?.role).toBe(Role.AGENCY);
      expect(prismaMock.agency.update).toHaveBeenCalledWith({
        where: { id: 'ag_1' },
        data: { userId: 'new_u_agency' },
      });
    });
  });
});
