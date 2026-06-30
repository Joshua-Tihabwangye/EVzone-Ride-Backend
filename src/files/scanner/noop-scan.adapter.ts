import { Injectable } from '@nestjs/common';
import { ScanAdapter, ScanResult } from './scan-adapter.interface';

@Injectable()
export class NoOpScanAdapter implements ScanAdapter {
  readonly providerName = 'NOOP';

  async scan(): Promise<ScanResult> {
    return { status: 'CLEAN', reason: 'Scanner disabled' };
  }
}
