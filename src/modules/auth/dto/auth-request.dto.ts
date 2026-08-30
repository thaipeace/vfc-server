import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthRequestDto {
  @ApiProperty({
    description: 'Số điện thoại đăng nhập (định dạng Việt Nam)',
    example: '0988366412',
  })
  phone: string;

  @ApiPropertyOptional({
    description: 'SSE Connection ID để nhận OTP real-time nếu có',
    example: 'conn_123456',
  })
  connectionId?: string;

  @ApiPropertyOptional({
    description: 'Browser Credential ID từ localStorage',
    example: 'cred_abcdef123',
  })
  credentialId?: string;

  @ApiPropertyOptional({
    description: 'Browser Credential Token bí mật từ localStorage',
    example: 'raw_secret_token_xyz',
  })
  credentialToken?: string;
}
