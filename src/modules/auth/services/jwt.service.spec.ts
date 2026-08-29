import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from './jwt.service';
import { Role } from '@prisma/client';

describe('JwtService', () => {
  let service: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'JWT_SECRET') return 'test_jwt_secret_key_1234567890';
              if (key === 'JWT_EXPIRES') return '1h';
              return null;
            },
          },
        },
      ],
    }).compile();

    service = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should sign and verify a valid JWT token', async () => {
    const payload = {
      sub: 'user_123',
      phone: '0988366412',
      role: Role.FARMER,
      sessionId: 'session_abc',
    };

    const token = await service.signToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await service.verifyToken(token);
    expect(verified).toBeDefined();
    expect(verified?.sub).toBe(payload.sub);
    expect(verified?.phone).toBe(payload.phone);
    expect(verified?.role).toBe(payload.role);
    expect(verified?.sessionId).toBe(payload.sessionId);
  });

  it('should return null for invalid or tampered token', async () => {
    const validToken = await service.signToken({
      sub: 'user_123',
      phone: '0988366412',
      role: Role.FARMER,
    });

    const tampered = validToken.slice(0, -5) + 'xxxxx';
    const result = await service.verifyToken(tampered);
    expect(result).toBeNull();
  });
});
