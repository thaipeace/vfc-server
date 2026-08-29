import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { extractPhoneCore } from '../../../common/utils/phone';

@Injectable()
export class OtpService {
  /**
   * Kiểm tra xem số điện thoại có thuộc diện dev test bypass OTP không (09883664xx)
   */
  isDevBypassPhone(phone: string): boolean {
    const core = extractPhoneCore(phone);
    if (!core) return false;
    // Khớp các SĐT dev dạng 09883664xx hoặc 9883664xx
    return core.startsWith('9883664') || phone.includes('09883664');
  }

  /**
   * Tạo mã OTP ngẫu nhiên 4 chữ số (1000 - 9999).
   * Nếu là SĐT dev bypass -> trả về 1111 cố định.
   */
  generateOtp(phone?: string): string {
    if (phone && this.isDevBypassPhone(phone)) {
      return '1111';
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Băm mã OTP bằng bcrypt với salt rounds = 10
   */
  async hashOtp(otp: string): Promise<string> {
    return await bcrypt.hash(otp, 10);
  }

  /**
   * Kiểm tra mã OTP plaintext với mã băm bcrypt
   */
  async verifyOtpHash(plainOtp: string, hashedOtp: string): Promise<boolean> {
    return await bcrypt.compare(plainOtp, hashedOtp);
  }
}
