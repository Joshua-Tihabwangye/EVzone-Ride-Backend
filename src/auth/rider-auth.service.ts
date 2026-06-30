import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AccountStatus, UserRole } from '../common/enums';
import { JwtPayload } from '../common/interfaces';
import { randomOtp, randomToken, sha256 } from '../common/utils/security';
import { OtpCode, RefreshToken, User } from '../database/entities';
import { RedisService } from '../infrastructure/redis.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  RiderLoginDto,
  RiderRegisterDto,
  RiderResetPasswordDto,
  RiderVerifyDto,
  RiderVerifyResetDto,
} from './rider-auth.dto';
import { SmtpMailService } from './smtp-mail.service';

@Injectable()
export class RiderAuthService {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly smtp: SmtpMailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(OtpCode) private readonly otpCodes: Repository<OtpCode>,
  ) {}

  async register(dto: RiderRegisterDto) {
    const session = await this.authService.register(
      {
        email: dto.email,
        phone: dto.phone,
        password: dto.password,
        fullName: dto.fullName,
        role: UserRole.RIDER,
      },
      undefined,
    );
    await this.sendVerificationEmail(dto.email, dto.fullName);
    return { ...session, emailVerificationSent: true };
  }

  async verifyAccount(dto: RiderVerifyDto, metadata?: { userAgent?: string; ipAddress?: string }) {
    await this.authService.verifyOtp({
      destination: dto.email,
      purpose: 'VERIFY_ACCOUNT',
      code: dto.code,
    });
    const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    if (!user) throw new NotFoundException('User not found');
    user.isEmailVerified = true;
    await this.users.save(user);
    return this.issueSession(user, metadata);
  }

  async resendVerification(email: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user) return { sent: false, reason: 'USER_NOT_FOUND' };
    if (user.isEmailVerified) return { sent: false, reason: 'ALREADY_VERIFIED' };
    await this.sendVerificationEmail(email, `${user.firstName} ${user.lastName}`.trim());
    return { sent: true };
  }

  async login(dto: RiderLoginDto, metadata?: { userAgent?: string; ipAddress?: string }) {
    const session = await this.authService.login(dto, metadata);
    const user = await this.users.findOne({ where: { email: dto.identifier.toLowerCase() } });
    if (user && !user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }
    return session;
  }

  async forgotPassword(identifier: string) {
    const user = await this.usersService.findForAuthentication(identifier);
    if (!user || !user.email) return { sent: false, reason: 'NO_EMAIL_DESTINATION' };
    const code = randomOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.otpCodes.save(
      this.otpCodes.create({
        destination: user.email,
        channel: 'EMAIL',
        purpose: 'PASSWORD_RESET',
        codeHash: sha256(code),
        expiresAt,
      }),
    );
    await this.smtp.sendVerificationCode({
      to: user.email,
      code,
      purpose: 'PASSWORD_RESET',
      fullName: `${user.firstName} ${user.lastName}`.trim(),
    });
    return { sent: true };
  }

  async verifyPasswordReset(dto: RiderVerifyResetDto) {
    return this.authService.verifyPasswordResetOtp({
      identifier: dto.identifier,
      code: dto.code,
    });
  }

  async resetPassword(dto: RiderResetPasswordDto) {
    return this.authService.resetPassword({
      resetToken: dto.resetToken,
      newPassword: dto.newPassword,
    });
  }

  private async sendVerificationEmail(email: string, fullName: string) {
    const code = randomOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.otpCodes.save(
      this.otpCodes.create({
        destination: email,
        channel: 'EMAIL',
        purpose: 'VERIFY_ACCOUNT',
        codeHash: sha256(code),
        expiresAt,
      }),
    );
    await this.smtp.sendVerificationCode({
      to: email,
      code,
      purpose: 'VERIFY_ACCOUNT',
      fullName,
    });
  }

  private async issueSession(user: User, metadata?: { userAgent?: string; ipAddress?: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = randomToken(48);
    const refreshTtlDays = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    const refreshHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtlDays * 86400000);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      }),
    );
    await this.redis.setJson(
      `auth:refresh:${refreshHash}`,
      { userId: user.id, expiresAt: expiresAt.toISOString() },
      refreshTtlDays * 86400,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 900),
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }
}
