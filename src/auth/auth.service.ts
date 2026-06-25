import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  MembershipStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  ServiceType,
  UserRole,
} from '../common/enums';
import { AuthUser, JwtPayload } from '../common/interfaces';
import { randomOtp, randomToken, safeEqualHash, sha256 } from '../common/utils/security';
import {
  DriverProfile,
  FleetProfile,
  Organization,
  OrganizationMember,
  OtpCode,
  PasswordResetToken,
  RefreshToken,
  User,
  Wallet,
} from '../database/entities';
import { RedisService } from '../infrastructure/redis.service';
import { UsersService } from '../users/users.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  RequestOtpDto,
  ResetPasswordDto,
  VerifyOtpDto,
  VerifyPasswordResetOtpDto,
} from './auth.dto';
import { AccessTokenClaims } from './access-token-verifier.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(OtpCode) private readonly otpCodes: Repository<OtpCode>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokens: Repository<PasswordResetToken>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly organizationMembers: Repository<OrganizationMember>,
    @InjectRepository(FleetProfile) private readonly fleetProfiles: Repository<FleetProfile>,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterDto, metadata?: { userAgent?: string; ipAddress?: string }) {
    if (!dto.email && !dto.phone) throw new BadRequestException('Email or phone is required');
    await this.usersService.assertEmailPhoneAvailable(dto.email, dto.phone);

    const requestedRoles = (dto.roles ?? []).map((role) => role.trim().toLowerCase()).filter(Boolean);
    const requestsAdmin =
      requestedRoles.some((role) => role.includes('admin')) || dto.role === UserRole.ADMIN;
    if (requestsAdmin) {
      const allowConfigured = String(this.config.get('ADMIN_PORTAL_ALLOW_SIGNUP') ?? 'false') === 'true';
      const isProduction = this.config.get('NODE_ENV') === 'production';
      const existingAdmins = await this.users.count({ where: { role: UserRole.ADMIN } });
      if (isProduction && !allowConfigured && existingAdmins > 0) {
        throw new BadRequestException('Admin self-registration is disabled');
      }
    }

    const role = requestsAdmin
      ? UserRole.ADMIN
      : dto.role && [UserRole.CUSTOMER, UserRole.RIDER].includes(dto.role)
        ? dto.role
        : UserRole.RIDER;
    const fallbackName = dto.email?.split('@')[0]?.replace(/[._-]+/g, ' ') || 'EVzone User';
    const suppliedName = dto.fullName ?? `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim();
    const fullName = (suppliedName || fallbackName).trim();
    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const roles = requestedRoles.length ? requestedRoles : [role.toLowerCase()];
    const user = await this.users.save(
      this.users.create({
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        firstName: firstName || 'EVzone',
        lastName: rest.join(' ') || 'User',
        passwordHash: await bcrypt.hash(dto.password, 12),
        role,
        status: AccountStatus.ACTIVE,
        metadata: {
          roles,
          invitePending: dto.invite === true,
          ...(role === UserRole.ADMIN
            ? {
                admin: {
                  roles,
                  permissions: roles.some((item) => ['super_admin', 'super-admin'].includes(item))
                    ? ['*']
                    : ['admin.portal'],
                },
              }
            : {}),
        },
      }),
    );
    await this.wallets.save(
      this.wallets.create({ userId: user.id, currency: user.currency, availableBalance: 0 }),
    );
    return this.issueSession(user, metadata);
  }

  async login(dto: LoginDto, metadata?: { userAgent?: string; ipAddress?: string }) {
    const identifier = (dto.identifier ?? dto.email)?.trim();
    if (!identifier) throw new BadRequestException('Email, phone or identifier is required');
    const user = await this.usersService.findForAuthentication(identifier);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== AccountStatus.ACTIVE) throw new UnauthorizedException(`Account is ${user.status}`);
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return this.issueSession(user, metadata);
  }

  async refresh(refreshToken: string, metadata?: { userAgent?: string; ipAddress?: string }) {
    const hash = sha256(refreshToken);
    const cached = await this.redis.getJson<{ revoked?: boolean }>(this.refreshKey(hash));
    if (cached?.revoked) throw new UnauthorizedException('Refresh token is invalid or expired');
    const token = await this.refreshTokens
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .where('token.tokenHash = :hash', { hash })
      .andWhere('token.revokedAt IS NULL')
      .andWhere('token.expiresAt > :now', { now: new Date() })
      .getOne();
    if (!token) throw new UnauthorizedException('Refresh token is invalid or expired');
    token.revokedAt = new Date();
    await this.refreshTokens.save(token);
    await this.redis.delete(this.refreshKey(hash));
    const user = await this.usersService.findById(token.userId);
    return this.issueSession(user, metadata);
  }

  async logout(refreshToken: string): Promise<{ loggedOut: true }> {
    const hash = sha256(refreshToken);
    await this.refreshTokens.update({ tokenHash: hash }, { revokedAt: new Date() });
    await this.redis.setJson(this.refreshKey(hash), { revoked: true }, 3600);
    return { loggedOut: true };
  }

  async requestOtp(dto: RequestOtpDto) {
    const code = randomOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = await this.otpCodes.save(
      this.otpCodes.create({
        destination: dto.destination,
        channel: dto.channel,
        purpose: dto.purpose,
        codeHash: sha256(code),
        expiresAt,
      }),
    );
    await this.redis.setJson(
      this.otpKey(dto.destination, dto.purpose),
      { id: otp.id, codeHash: sha256(code), expiresAt: expiresAt.toISOString(), attempts: 0 },
      600,
    );
    return {
      sent: true,
      channel: dto.channel,
      expiresAt,
      ...(this.config.get('NODE_ENV') === 'production' ? {} : { debugCode: code }),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    if (dto.email && dto.otp) {
      const verified = await this.verifyPasswordResetOtp({ email: dto.email, otp: dto.otp });
      const expiresInSeconds = Math.max(
        1,
        Math.floor((new Date(verified.expiresAt).getTime() - Date.now()) / 1000),
      );
      return {
        verified: true,
        resetRequired: true,
        resetToken: verified.resetToken,
        expiresInSeconds,
        otpLength: 6,
      };
    }
    const destination = dto.destination?.trim();
    const purpose = dto.purpose?.trim() || 'VERIFY_ACCOUNT';
    const code = dto.code;
    if (!destination || !code) throw new BadRequestException('Destination and OTP code are required');
    const otp = await this.otpCodes
      .createQueryBuilder('otp')
      .addSelect('otp.codeHash')
      .where('otp.destination = :destination', { destination })
      .andWhere('otp.purpose = :purpose', { purpose })
      .andWhere('otp.consumedAt IS NULL')
      .andWhere('otp.expiresAt > :now', { now: new Date() })
      .orderBy('otp.createdAt', 'DESC')
      .getOne();
    if (!otp) throw new BadRequestException('OTP is expired or not found');
    if (otp.attempts >= Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5)) {
      throw new BadRequestException('OTP attempt limit exceeded');
    }
    otp.attempts += 1;
    if (!safeEqualHash(code, otp.codeHash)) {
      await this.otpCodes.save(otp);
      await this.redis.setJson(
        this.otpKey(destination, purpose),
        {
          id: otp.id,
          codeHash: otp.codeHash,
          expiresAt: otp.expiresAt.toISOString(),
          attempts: otp.attempts,
        },
        Math.max(1, Math.floor((otp.expiresAt.getTime() - Date.now()) / 1000)),
      );
      throw new BadRequestException('Invalid OTP');
    }
    otp.consumedAt = new Date();
    await this.otpCodes.save(otp);
    await this.redis.delete(this.otpKey(destination, purpose));
    const user = await this.users.findOne({
      where: [{ email: destination }, { phone: destination }],
    });
    if (user) {
      if (user.email === destination) user.isEmailVerified = true;
      if (user.phone === destination) user.isPhoneVerified = true;
      await this.users.save(user);
    }
    return { verified: true };
  }

  async forgotPassword(dto: ForgotPasswordDto, ipAddress?: string) {
    const identifier = (dto.identifier ?? dto.email)?.trim();
    if (!identifier) throw new BadRequestException('Email or identifier is required');
    const user = await this.usersService.findForAuthentication(identifier);
    if (!user) return { sent: true };
    const destination = user.email ?? user.phone;
    if (!destination) return { sent: true };
    const channel = dto.channel ?? (user.email ? 'EMAIL' : 'SMS');
    const response = await this.requestOtp({ destination, channel, purpose: 'PASSWORD_RESET' });
    await this.redis.setJson(
      `auth:password-reset-request:${user.id}`,
      { ipAddress, requestedAt: new Date().toISOString() },
      600,
    );
    return response;
  }

  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto, ipAddress?: string) {
    const identifier = (dto.identifier ?? dto.email)?.trim();
    const code = dto.code ?? dto.otp;
    if (!identifier || !code) throw new BadRequestException('Email and verification code are required');
    const user = await this.usersService.findForAuthentication(identifier);
    if (!user) throw new BadRequestException('Invalid or expired verification code');
    const destination = user.email ?? user.phone;
    if (!destination) throw new BadRequestException('Account has no recovery destination');
    await this.verifyOtp({ destination, purpose: 'PASSWORD_RESET', code });
    const resetToken = randomToken(48);
    const tokenHash = sha256(resetToken);
    const ttlMinutes = Number(this.config.get('PASSWORD_RESET_TTL_MINUTES') ?? 15);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const record = await this.passwordResetTokens.save(
      this.passwordResetTokens.create({ userId: user.id, tokenHash, expiresAt, requestedFromIp: ipAddress }),
    );
    await this.redis.setJson(
      this.passwordResetKey(tokenHash),
      { id: record.id, userId: user.id, expiresAt: expiresAt.toISOString() },
      ttlMinutes * 60,
    );
    return { resetToken, expiresAt };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (!dto.resetToken) {
      const identifier = dto.email?.trim();
      if (!identifier || !dto.otp) {
        throw new BadRequestException('Reset token or email and OTP are required');
      }
      const user = await this.usersService.findForAuthentication(identifier);
      if (!user) throw new BadRequestException('Invalid or expired verification code');
      const destination = user.email ?? user.phone;
      if (!destination) throw new BadRequestException('Account has no recovery destination');
      const otp = await this.otpCodes
        .createQueryBuilder('otp')
        .addSelect('otp.codeHash')
        .where('otp.destination = :destination', { destination })
        .andWhere('otp.purpose = :purpose', { purpose: 'PASSWORD_RESET' })
        .andWhere('otp.consumedAt IS NOT NULL')
        .andWhere('otp.expiresAt > :now', { now: new Date() })
        .orderBy('otp.createdAt', 'DESC')
        .getOne();
      if (!otp || !safeEqualHash(dto.otp, otp.codeHash)) {
        throw new BadRequestException('Invalid or expired verification code');
      }
      user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
      await this.users.save(user);
      otp.expiresAt = new Date();
      await this.otpCodes.save(otp);
      await this.passwordResetTokens
        .createQueryBuilder()
        .update()
        .set({ consumedAt: new Date() })
        .where('userId = :userId', { userId: user.id })
        .andWhere('consumedAt IS NULL')
        .execute();
      await this.revokeUserRefreshTokens(user.id);
      return { reset: true };
    }

    const tokenHash = sha256(dto.resetToken);
    const cached = await this.redis.getJson<{ userId: string }>(this.passwordResetKey(tokenHash));
    const record = await this.passwordResetTokens
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .where('token.tokenHash = :tokenHash', { tokenHash })
      .andWhere('token.consumedAt IS NULL')
      .andWhere('token.expiresAt > :now', { now: new Date() })
      .getOne();
    if (!record || (cached && cached.userId !== record.userId)) {
      throw new BadRequestException('Password reset token is invalid or expired');
    }
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId: record.userId })
      .getOne();
    if (!user) throw new BadRequestException('Account no longer exists');
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.save(user);
    record.consumedAt = new Date();
    await this.passwordResetTokens.save(record);
    await this.redis.delete(this.passwordResetKey(tokenHash));
    await this.revokeUserRefreshTokens(user.id);
    return { reset: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.save(user);
    await this.revokeUserRefreshTokens(userId);
    return { changed: true };
  }

  private async issueSession(user: User, metadata?: { userAgent?: string; ipAddress?: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: this.userRoles(user),
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = randomToken(48);
    const refreshTtlDays = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    const refreshHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtlDays * 86400000);
    const tokenRecord = await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      }),
    );
    await this.redis.setJson(
      this.refreshKey(refreshHash),
      { id: tokenRecord.id, userId: user.id, expiresAt: expiresAt.toISOString() },
      refreshTtlDays * 86400,
    );
    const safeUser: Partial<User> = { ...user };
    delete safeUser.passwordHash;
    const expiresIn = String(this.config.get('JWT_ACCESS_TTL') ?? '15m');
    return {
      user: { ...safeUser, roles: this.userRoles(user) },
      accessToken,
      refreshToken,
      expiresIn,
      expiresInSeconds: this.durationSeconds(expiresIn),
    };
  }

  async session(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const [driver, organizations] = await Promise.all([
      this.driverProfiles.findOne({ where: { userId } }),
      this.organizations.find({ where: { primaryOwnerUserId: userId }, order: { createdAt: 'ASC' } }),
    ]);
    const metadata = user.metadata ?? {};
    const admin =
      metadata.admin && typeof metadata.admin === 'object' && !Array.isArray(metadata.admin)
        ? (metadata.admin as Record<string, unknown>)
        : {};
    const permissions = Array.isArray(admin.permissions)
      ? admin.permissions.map(String)
      : user.role === UserRole.ADMIN
        ? ['*']
        : [];
    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        phone: user.phone ?? null,
        status: user.status.toLowerCase(),
        roles: this.userRoles(user),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
      profile: {
        driverProfileId: driver?.id ?? null,
        riderProfileId: [UserRole.RIDER, UserRole.CUSTOMER].includes(user.role) ? user.id : null,
        fleetProfileId: organizations[0]?.id ?? null,
        adminProfileId: user.role === UserRole.ADMIN ? user.id : null,
      },
      permissions,
      defaultRedirect: this.defaultRedirect(user.role),
    };
  }

  private userRoles(user: User): string[] {
    const metadata = user.metadata ?? {};
    const direct = Array.isArray(metadata.roles) ? metadata.roles.map(String) : [];
    const admin =
      metadata.admin && typeof metadata.admin === 'object' && !Array.isArray(metadata.admin)
        ? (metadata.admin as Record<string, unknown>)
        : {};
    const adminRoles = Array.isArray(admin.roles) ? admin.roles.map(String) : [];
    return [...new Set([...direct, ...adminRoles, user.role.toLowerCase()])];
  }

  private defaultRedirect(role: UserRole): string {
    if (role === UserRole.ADMIN) return '/admin';
    if (role === UserRole.DRIVER) return '/driver';
    if ([UserRole.FLEET_MANAGER, UserRole.FLEET_PARTNER].includes(role)) return '/fleet';
    if ([UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT].includes(role)) return '/agent';
    return '/';
  }

  private durationSeconds(value: string): number {
    const match = value.trim().match(/^(\d+)(s|m|h|d)?$/i);
    if (!match) return 900;
    const amount = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();
    return amount * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1);
  }

  private refreshKey(hash: string): string {
    return `auth:refresh:${hash}`;
  }

  private otpKey(destination: string, purpose: string): string {
    return `auth:otp:${sha256(destination.toLowerCase())}:${purpose}`;
  }

  private passwordResetKey(hash: string): string {
    return `auth:password-reset:${hash}`;
  }

  private async revokeUserRefreshTokens(userId: string): Promise<void> {
    const active = await this.refreshTokens
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .where('token.userId = :userId', { userId })
      .andWhere('token.revokedAt IS NULL')
      .getMany();
    await this.refreshTokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL')
      .execute();
    await Promise.all(active.map((token) => this.redis.delete(this.refreshKey(token.tokenHash))));
  }

  async validateAccessClaims(claims: AccessTokenClaims): Promise<AuthUser> {
    const local = await this.users.findOne({
      where: { id: claims.sub, status: AccountStatus.ACTIVE },
    });
    if (local) return this.toAuthUser(local);

    const email = this.claimString(claims, ['email', 'preferred_username'])?.toLowerCase();
    const phone = this.claimString(claims, ['phone_number', 'phone']);
    let user = await this.users.findOne({ where: { externalSubject: claims.sub } });
    if (!user && email) user = await this.users.findOne({ where: { email } });

    const role = this.externalUserRole(claims);
    const names = this.externalNames(claims);
    if (!user) {
      user = await this.users.save(
        this.users.create({
          externalSubject: claims.sub,
          identityProvider: typeof claims.iss === 'string' ? claims.iss : 'EVZONE_ACCOUNTS',
          email,
          phone,
          firstName: names.firstName,
          lastName: names.lastName,
          passwordHash: await bcrypt.hash(randomToken(48), 12),
          role,
          status: AccountStatus.ACTIVE,
          isEmailVerified: this.claimBoolean(claims, 'email_verified'),
          isPhoneVerified: this.claimBoolean(claims, 'phone_number_verified'),
          metadata: { oidcManaged: true, lastClaimsSyncAt: new Date().toISOString() },
        }),
      );
    } else {
      if (user.status !== AccountStatus.ACTIVE) throw new UnauthorizedException(`Account is ${user.status}`);
      user.externalSubject = user.externalSubject ?? claims.sub;
      user.identityProvider =
        user.identityProvider ?? (typeof claims.iss === 'string' ? claims.iss : 'EVZONE_ACCOUNTS');
      user.email = user.email ?? email;
      user.phone = user.phone ?? phone;
      user.firstName = names.firstName || user.firstName;
      user.lastName = names.lastName || user.lastName;
      user.role = role;
      user.isEmailVerified = user.isEmailVerified || this.claimBoolean(claims, 'email_verified');
      user.isPhoneVerified = user.isPhoneVerified || this.claimBoolean(claims, 'phone_number_verified');
      user.metadata = {
        ...(user.metadata ?? {}),
        oidcManaged: true,
        lastClaimsSyncAt: new Date().toISOString(),
      };
      user = await this.users.save(user);
    }

    if (!(await this.wallets.findOne({ where: { userId: user.id } }))) {
      await this.wallets.save(
        this.wallets.create({ userId: user.id, currency: user.currency, availableBalance: 0 }),
      );
    }
    const organizationId = await this.ensureExternalOrganizations(user, claims);
    return { ...this.toAuthUser(user), organizationId };
  }

  async validateJwt(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findOne({ where: { id: payload.sub, status: AccountStatus.ACTIVE } });
    if (!user) throw new UnauthorizedException('User is no longer active');
    return this.toAuthUser(user);
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: this.userRoles(user),
    };
  }

  private claimString(claims: AccessTokenClaims, names: string[]): string | undefined {
    return this.firstScalarString(names.map((name) => claims[name]));
  }

  private firstScalarString(values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return undefined;
  }

  private claimBoolean(claims: AccessTokenClaims, name: string): boolean {
    const value = claims[name];
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private externalNames(claims: AccessTokenClaims): { firstName: string; lastName: string } {
    const givenName = this.claimString(claims, ['given_name', 'first_name']);
    const familyName = this.claimString(claims, ['family_name', 'last_name']);
    if (givenName || familyName) {
      return { firstName: givenName ?? 'EVzone', lastName: familyName ?? 'User' };
    }
    const displayName = this.claimString(claims, ['name']) ?? 'EVzone User';
    const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean);
    return { firstName: firstName || 'EVzone', lastName: rest.join(' ') || 'User' };
  }

  private externalRoles(claims: AccessTokenClaims): string[] {
    const roles = new Set<string>();
    const visited = new Set<object>();
    const add = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            add(JSON.parse(trimmed) as unknown);
            return;
          } catch {
            // Continue with the space/comma-delimited representation.
          }
        }
        value
          .split(/[ ,]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean)
          .forEach((entry) => roles.add(entry));
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      if (!value || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      const object = value as Record<string, unknown>;
      add(object.role);
      add(object.roles);
      add(object.permissions);
      add(object.scope);
      for (const nested of Object.values(object)) {
        if (nested && typeof nested === 'object') add(nested);
      }
    };
    add(claims.role);
    add(claims.roles);
    add(claims['evzone.roles']);
    add(claims['evzone.principal']);
    add(claims.evzone_principal);
    add(claims['https://evzone.app/roles']);
    add(claims.fleet_roles);
    add(claims.scope);
    add(claims.realm_access);
    add(claims.resource_access);
    for (const organization of this.externalOrganizations(claims)) add(organization.role);
    return [...roles];
  }

  private externalUserRole(claims: AccessTokenClaims): UserRole {
    const roles = this.externalRoles(claims);
    const has = (...values: string[]) => values.some((value) => roles.includes(value));
    if (has('super-admin', 'super_admin', 'admin', 'evzone.admin')) return UserRole.ADMIN;
    if (has('fleet_owner', 'fleet-owner', 'fleet.partner', 'fleet_partner', 'owner')) {
      return UserRole.FLEET_PARTNER;
    }
    if (has('fleet_dispatcher', 'fleet-dispatcher', 'dispatcher')) return UserRole.DISPATCHER;
    if (has('fleet_manager', 'fleet-manager', 'fleet_finance', 'fleet-finance', 'manager', 'finance')) {
      return UserRole.FLEET_MANAGER;
    }
    if (has('driver')) return UserRole.DRIVER;
    if (has('agent')) return UserRole.AGENT;
    return UserRole.RIDER;
  }

  private externalOrganizations(
    claims: AccessTokenClaims,
  ): Array<{ id: string; name: string; role?: string }> {
    const raw =
      claims['evzone.organizations'] ??
      claims.evzone_organizations ??
      claims.organizations ??
      claims.org_memberships ??
      claims.organization ??
      claims.tenants;
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = undefined;
      }
    }
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
    return entries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return undefined;
        const object = entry as Record<string, unknown>;
        const id = this.firstScalarString([
          object.id,
          object.organizationId,
          object.organization_id,
          object.orgId,
          object.org_id,
          object.tenantId,
          object.tenant_id,
        ]);
        const name = this.firstScalarString([
          object.name,
          object.displayName,
          object.organizationName,
          object.organization_name,
          object.org_name,
          object.tenantName,
        ]);
        if (!id) return undefined;
        return {
          id,
          name: name || `EVzone Fleet ${id.slice(0, 8)}`,
          role: this.firstScalarString([object.role, object.membershipRole, object.membership_role]) ?? '',
        };
      })
      .filter((entry): entry is { id: string; name: string; role: string } => !!entry);
  }

  private preferredExternalOrganizationId(claims: AccessTokenClaims): string | undefined {
    const direct =
      claims.organization_id ??
      claims.organizationId ??
      claims.org_id ??
      claims.orgId ??
      claims.tenant_id ??
      claims.tenantId ??
      claims.selected_organization_id;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    return this.externalOrganizations(claims)[0]?.id;
  }

  private async ensureExternalOrganizations(
    user: User,
    claims: AccessTokenClaims,
  ): Promise<string | undefined> {
    let organizations = this.externalOrganizations(claims);
    if (
      !organizations.length &&
      [UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER, UserRole.DISPATCHER].includes(user.role)
    ) {
      organizations = [
        {
          id: `personal:${claims.sub}`,
          name: `${user.firstName} ${user.lastName} Fleet`,
          role: user.role === UserRole.FLEET_PARTNER ? 'owner' : 'fleet_manager',
        },
      ];
    }

    const preferredExternalId = this.preferredExternalOrganizationId(claims);
    const globalRoles = this.externalRoles(claims);
    let firstOrganizationId: string | undefined;
    let preferredOrganizationId: string | undefined;

    for (const external of organizations) {
      let organization = await this.organizations.findOne({ where: { externalId: external.id } });
      if (!organization) {
        const code = `OIDC-${sha256(external.id).slice(0, 12).toUpperCase()}`;
        organization = await this.organizations.findOne({ where: { code } });
        if (!organization) {
          organization = await this.organizations.save(
            this.organizations.create({
              externalId: external.id,
              name: external.name,
              legalName: external.name,
              type: OrganizationType.FLEET_PARTNER,
              status: OrganizationStatus.ACTIVE,
              code,
              primaryOwnerUserId: user.id,
              contactEmail: user.email,
              contactPhone: user.phone,
              currency: user.currency,
              countryCode: user.countryCode,
              serviceCapabilities: Object.values(ServiceType),
              approvedByUserId: user.id,
              approvedAt: new Date(),
              settings: { oidcManaged: true },
            }),
          );
        }
      }

      firstOrganizationId = firstOrganizationId ?? organization.id;
      if (external.id === preferredExternalId) preferredOrganizationId = organization.id;
      const roleHint = external.role || globalRoles.find((entry) => entry.startsWith('fleet_'));
      const memberRole = this.externalOrganizationRole(roleHint, user.role);
      let membership = await this.organizationMembers.findOne({
        where: { organizationId: organization.id, userId: user.id },
      });
      if (!membership) {
        membership = this.organizationMembers.create({
          organizationId: organization.id,
          userId: user.id,
          role: memberRole,
          status: MembershipStatus.ACTIVE,
          invitedAt: new Date(),
          joinedAt: new Date(),
          permissions: ['fleet.portal.*'],
        });
      } else {
        membership.role = memberRole;
        membership.status = MembershipStatus.ACTIVE;
        membership.joinedAt = membership.joinedAt ?? new Date();
      }
      await this.organizationMembers.save(membership);

      if (!(await this.fleetProfiles.findOne({ where: { organizationId: organization.id } }))) {
        await this.fleetProfiles.save(
          this.fleetProfiles.create({
            organizationId: organization.id,
            code: `FLT-${sha256(organization.id).slice(0, 10).toUpperCase()}`,
            displayName: organization.name,
            status: OrganizationStatus.ACTIVE,
            serviceCapabilities: Object.values(ServiceType),
            schoolShuttleEnabled: true,
            operationsEmail: organization.contactEmail,
            operationsPhone: organization.contactPhone,
            dispatchRules: { automaticMatching: true, oidcManaged: true },
            payoutConfiguration: { currency: organization.currency },
          }),
        );
      }
    }
    return preferredOrganizationId ?? firstOrganizationId;
  }

  private externalOrganizationRole(role: string | undefined, userRole: UserRole): OrganizationMemberRole {
    const normalized = String(role ?? '')
      .trim()
      .toLowerCase()
      .replaceAll('-', '_');
    if (['owner', 'fleet_owner'].includes(normalized) || userRole === UserRole.FLEET_PARTNER) {
      return OrganizationMemberRole.OWNER;
    }
    if (['admin', 'fleet_admin'].includes(normalized)) return OrganizationMemberRole.ADMIN;
    if (['dispatcher', 'fleet_dispatcher'].includes(normalized)) return OrganizationMemberRole.DISPATCHER;
    if (['finance', 'fleet_finance'].includes(normalized)) return OrganizationMemberRole.FINANCE;
    if (['compliance'].includes(normalized)) return OrganizationMemberRole.COMPLIANCE;
    if (['viewer'].includes(normalized)) return OrganizationMemberRole.VIEWER;
    return OrganizationMemberRole.FLEET_MANAGER;
  }
}
