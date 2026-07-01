import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import {
  RiderForgotPasswordDto,
  RiderLoginDto,
  RiderRegisterDto,
  RiderResendVerificationDto,
  RiderResetPasswordDto,
  RiderVerifyDto,
  RiderVerifyResetDto,
} from './rider-auth.dto';
import { RiderAuthService } from './rider-auth.service';

@Controller('auth/rider')
export class RiderAuthController {
  constructor(private readonly riderAuthService: RiderAuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RiderRegisterDto) {
    return this.riderAuthService.register(dto);
  }

  @Public()
  @Post('verify')
  verify(@Body() dto: RiderVerifyDto, @Headers('user-agent') userAgent?: string, @Ip() ipAddress?: string) {
    return this.riderAuthService.verifyAccount(dto, { userAgent, ipAddress });
  }

  @Public()
  @Post('resend-verification')
  resendVerification(@Body() dto: RiderResendVerificationDto) {
    return this.riderAuthService.resendVerification(dto.email);
  }

  @Public()
  @Post('login')
  login(@Body() dto: RiderLoginDto, @Headers('user-agent') userAgent?: string, @Ip() ipAddress?: string) {
    return this.riderAuthService.login(dto, { userAgent, ipAddress });
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: RiderForgotPasswordDto) {
    return this.riderAuthService.forgotPassword(dto.identifier);
  }

  @Public()
  @Post('verify-reset')
  verifyReset(@Body() dto: RiderVerifyResetDto) {
    return this.riderAuthService.verifyPasswordReset(dto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: RiderResetPasswordDto) {
    return this.riderAuthService.resetPassword(dto);
  }
}
