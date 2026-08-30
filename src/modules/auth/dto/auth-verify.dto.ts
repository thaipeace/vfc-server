import { ApiProperty } from '@nestjs/swagger';

export class AuthVerifyDto {
  @ApiProperty({
    description: 'Challenge ID nhận được từ bước yêu cầu gửi OTP (/auth/request)',
    example: 'cm7a1b2c3d4e5f6g7h8i9',
  })
  challengeId: string;

  @ApiProperty({
    description: 'Mã OTP gồm 4 chữ số',
    example: '1111',
  })
  otp: string;
}
