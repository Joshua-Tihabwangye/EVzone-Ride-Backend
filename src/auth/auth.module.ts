import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AccessTokenVerifierService } from './access-token-verifier.service';
import { RiderAuthController } from './rider-auth.controller';
import { RiderAuthService } from './rider-auth.service';
import { SmtpMailService } from './smtp-mail.service';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'evzone-local-access-secret-change-in-production',
        signOptions: { expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as any },
      }),
    }),
  ],
  controllers: [AuthController, RiderAuthController],
  providers: [AuthService, JwtStrategy, AccessTokenVerifierService, RiderAuthService, SmtpMailService],
  exports: [AuthService, JwtModule, AccessTokenVerifierService, RiderAuthService],
})
export class AuthModule {}
