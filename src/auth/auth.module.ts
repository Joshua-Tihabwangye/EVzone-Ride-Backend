import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { getRequiredSecret } from '../common/utils/required-secret.util';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AccessTokenVerifierService } from './access-token-verifier.service';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getRequiredSecret(
          'JWT_SECRET',
          config.get<string>('JWT_SECRET'),
          config.get<string>('NODE_ENV'),
          { allowLocalFallback: true, localFallback: 'evzone-local-access-secret-change-in-production' },
        ),
        signOptions: { expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AccessTokenVerifierService],
  exports: [AuthService, JwtModule, AccessTokenVerifierService],
})
export class AuthModule {}
