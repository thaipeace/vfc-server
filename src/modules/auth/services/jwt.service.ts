import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { Role } from '@prisma/client';

export interface SessionPayload {
  sub: string; // userId
  phone: string;
  role: Role;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private readonly jwtSecret: Uint8Array;
  private readonly jwtExpires: string;

  constructor(private readonly configService: ConfigService) {
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      process.env.JWT_SECRET ||
      'change_me_jwt_secret';
    this.jwtSecret = new TextEncoder().encode(secret);
    this.jwtExpires =
      this.configService.get<string>('JWT_EXPIRES') ||
      process.env.JWT_EXPIRES ||
      '60d';
  }

  /**
   * Ký JWT Token với thuật toán HS256 (Tương thích 100% với Next.js middleware)
   */
  async signToken(
    payload: Omit<SessionPayload, 'iat' | 'exp'>,
  ): Promise<string> {
    return await new jose.SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.jwtExpires)
      .sign(this.jwtSecret);
  }

  /**
   * Giải mã và xác thực JWT Token
   */
  async verifyToken(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jose.jwtVerify(token, this.jwtSecret);
      return payload as unknown as SessionPayload;
    } catch (err: any) {
      this.logger.debug(`JWT verification failed: ${err?.message}`);
      return null;
    }
  }
}
