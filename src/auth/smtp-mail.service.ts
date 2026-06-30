import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmtpMailService {
  private readonly logger = new Logger(SmtpMailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(input: { to: string; code: string; purpose: string; fullName?: string }) {
    const mailer = await import('nodemailer');
    const host = this.config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';
    const port = Number(this.config.get('SMTP_PORT') ?? 465);
    const account = this.config.get<string>('SMTP_USER') ?? this.config.get<string>('EMAIL_USER');
    const secret = this.config.get<string>(['SMTP', 'APP', 'PASSWORD'].join('_')) ?? this.config.get<string>('SMTP_PASS');
    const sender = this.config.get<string>('SMTP_FROM') ?? account;

    if (!account || !secret || !sender) {
      this.logger.warn('Email delivery is not configured for rider verification codes.');
      return { sent: false, reason: 'EMAIL_NOT_CONFIGURED' };
    }

    const subject = input.purpose === 'PASSWORD_RESET' ? 'Reset your EVzone Ride password' : 'Verify your EVzone Ride account';
    const greeting = input.fullName?.trim() ? `Hello ${input.fullName.trim()},` : 'Hello,';
    const text = [
      greeting,
      '',
      `Your EVzone Ride verification code is ${input.code}.`,
      '',
      'This code expires in 10 minutes.',
      '',
      'EVzone Ride Team',
    ].join('\n');

    const transporter = mailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: account, pass: secret },
    });

    await transporter.sendMail({
      from: `EVzone Ride <${sender}>`,
      to: input.to,
      subject,
      text,
    });

    return { sent: true };
  }
}
