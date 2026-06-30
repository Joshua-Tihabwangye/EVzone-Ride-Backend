import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClamAvScanAdapter } from './clamav-scan.adapter';
import { NoOpScanAdapter } from './noop-scan.adapter';
import { ScanAdapter } from './scan-adapter.interface';
import { WebhookScanAdapter } from './webhook-scan.adapter';

export const SCAN_ADAPTER = Symbol('SCAN_ADAPTER');

@Module({
  providers: [
    ClamAvScanAdapter,
    WebhookScanAdapter,
    NoOpScanAdapter,
    {
      provide: SCAN_ADAPTER,
      useFactory: (
        config: ConfigService,
        clamav: ClamAvScanAdapter,
        webhook: WebhookScanAdapter,
        noop: NoOpScanAdapter,
      ): ScanAdapter => {
        const provider = (config.get<string>('FILE_SCAN_PROVIDER') ?? 'NONE').trim().toUpperCase();
        if (provider === 'CLAMAV') return clamav;
        if (provider === 'WEBHOOK') return webhook;
        return noop;
      },
      inject: [ConfigService, ClamAvScanAdapter, WebhookScanAdapter, NoOpScanAdapter],
    },
  ],
  exports: [SCAN_ADAPTER],
})
export class ScannerModule {}
