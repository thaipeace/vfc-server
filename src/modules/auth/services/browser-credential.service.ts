import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserCredential } from '@prisma/client';
import { getPhoneVariants } from '../../../common/utils/phone';

export const CREDENTIAL_TTL_DAYS = 365;

export interface CreatedCredential {
  id: string;
  token: string;
  expiresAt: Date;
}

export interface ValidateCredentialResult {
  valid: boolean;
  userId?: string;
  credential?: BrowserCredential;
}

@Injectable()
export class BrowserCredentialService {
  private readonly logger = new Logger(BrowserCredentialService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Băm token bảo mật bằng SHA-256 trước khi lưu vào cơ sở dữ liệu
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * [UAT-ACCEPTED-GAP #2]
   * Tạo Browser Credential mới cho user (thời hạn 365 ngày).
   * Token thô được trả về cho trình duyệt lưu vào localStorage.
   */
  async create(
    userId: string,
    phone: string,
    userAgent?: string,
  ): Promise<CreatedCredential> {
    const rawToken = crypto.randomUUID();
    const credentialHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + CREDENTIAL_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const record = await this.prisma.browserCredential.create({
      data: {
        userId,
        phone,
        credentialHash,
        userAgent: userAgent || null,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    this.logger.log(
      `Created Browser Credential ${record.id} for user ${userId} (${phone}) with TTL 365 days`,
    );

    return {
      id: record.id,
      token: rawToken,
      expiresAt,
    };
  }

  /**
   * Kiểm tra tính hợp lệ của Browser Credential:
   * 1. ID tồn tại trong cơ sở dữ liệu
   * 2. Mã băm token khớp chính xác
   * 3. Số điện thoại khớp (xét cả các biến thể định dạng)
   * 4. Chưa hết hạn 365 ngày
   */
  async validate(
    credentialId?: string,
    token?: string,
    phone?: string,
  ): Promise<ValidateCredentialResult> {
    if (!credentialId || !token || !phone) {
      return { valid: false };
    }

    const record = await this.prisma.browserCredential.findUnique({
      where: { id: credentialId },
    });

    if (!record) {
      return { valid: false };
    }

    // 1. Kiểm tra hạn dùng
    if (record.expiresAt.getTime() < Date.now()) {
      this.logger.debug(`Browser Credential ${credentialId} has expired`);
      return { valid: false };
    }

    // 2. Kiểm tra khớp token hash
    const inputHash = this.hashToken(token);
    if (record.credentialHash !== inputHash) {
      this.logger.debug(
        `Browser Credential ${credentialId} token hash mismatch`,
      );
      return { valid: false };
    }

    // 3. Kiểm tra số điện thoại có khớp không
    const phoneVariants = getPhoneVariants(phone);
    if (!phoneVariants.includes(record.phone) && record.phone !== phone) {
      this.logger.debug(
        `Browser Credential ${credentialId} phone mismatch: DB ${record.phone} vs input ${phone}`,
      );
      return { valid: false };
    }

    // Gia hạn và cập nhật thời điểm sử dụng gần nhất
    await this.refresh(record.id).catch((err) => {
      this.logger.warn(`Failed to refresh credential ${record.id}: ${err?.message}`);
    });

    return {
      valid: true,
      userId: record.userId,
      credential: record,
    };
  }

  /**
   * Gia hạn thêm 365 ngày và cập nhật thời điểm sử dụng cuối
   */
  async refresh(credentialId: string): Promise<void> {
    const newExpiresAt = new Date(
      Date.now() + CREDENTIAL_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.browserCredential.update({
      where: { id: credentialId },
      data: {
        lastUsedAt: new Date(),
        expiresAt: newExpiresAt,
      },
    });
  }

  /**
   * Thu hồi / xóa một browser credential
   */
  async revoke(credentialId: string): Promise<void> {
    await this.prisma.browserCredential
      .delete({
        where: { id: credentialId },
      })
      .catch(() => null);
  }

  /**
   * Thu hồi tất cả credential của một user (dùng khi đổi mật khẩu/bảo mật)
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.browserCredential.deleteMany({
      where: { userId },
    });
  }
}
