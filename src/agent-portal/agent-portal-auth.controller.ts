import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LogoutDto, RefreshDto, ResetPasswordDto, VerifyPasswordResetOtpDto } from '../auth/auth.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { AgentPortalForgotPasswordDto, AgentPortalLoginDto } from './agent-portal.dto';
import { AgentPortalService } from './agent-portal.service';

const AGENT_PORTAL_ROLES = [UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT, UserRole.ADMIN];

@ApiTags('Agent Portal v7 - Authentication')
@Controller('agent/auth')
export class AgentPortalAuthController {
  constructor(private readonly service: AgentPortalService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate an Agent Portal, dispatcher, support or administrator account' })
  login(
    @Body() dto: AgentPortalLoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.service.login(dto, { userAgent, ipAddress });
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate an Agent Portal refresh token' })
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') userAgent?: string, @Ip() ipAddress?: string) {
    return this.service.refresh(dto.refreshToken, { userAgent, ipAddress });
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: AgentPortalForgotPasswordDto, @Ip() ipAddress?: string) {
    return this.service.forgotPassword(dto, ipAddress);
  }

  @Public()
  @Post('verify-reset-otp')
  verifyResetOtp(@Body() dto: VerifyPasswordResetOtpDto, @Ip() ipAddress?: string) {
    return this.service.verifyResetOtp(dto, ipAddress);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Roles(...AGENT_PORTAL_ROLES)
  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.service.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Roles(...AGENT_PORTAL_ROLES)
  @Get('me')
  me(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.profile(user, organizationId);
  }

  @ApiBearerAuth()
  @Roles(...AGENT_PORTAL_ROLES)
  @Post('training-gate/complete')
  completeTrainingGate(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.completeTrainingGate(user, organizationId);
  }
}
