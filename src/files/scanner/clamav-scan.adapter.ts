import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'node:net';
import { ScanAdapter, ScanResult } from './scan-adapter.interface';

@Injectable()
export class ClamAvScanAdapter implements ScanAdapter {
  readonly providerName = 'CLAMAV';
  private readonly logger = new Logger(ClamAvScanAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async scan(buffer: Buffer): Promise<ScanResult> {
    const host = this.config.get<string>('CLAMAV_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('CLAMAV_PORT') ?? 3310);
    const timeoutMs = Number(this.config.get<string>('CLAMAV_TIMEOUT_MS') ?? 10_000);

    return new Promise((resolve) => {
      const socket = new Socket();
      let response = '';
      let resolved = false;

      const finish = (result: ScanResult) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => finish({ status: 'ERROR', reason: 'ClamAV scan timed out' }));
      socket.once('error', (error) => {
        this.logger.warn(`ClamAV connection error: ${error.message}`);
        finish({ status: 'ERROR', reason: `ClamAV connection error: ${error.message}` });
      });
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('close', () => {
        if (resolved) return;
        const trimmed = response.trim();
        if (trimmed.endsWith('OK')) {
          finish({ status: 'CLEAN', details: { response: trimmed } });
        } else if (trimmed.includes('FOUND')) {
          finish({ status: 'INFECTED', reason: trimmed, details: { response: trimmed } });
        } else {
          finish({ status: 'ERROR', reason: `Unexpected ClamAV response: ${trimmed}` });
        }
      });

      socket.connect(port, host, () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 4096;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.subarray(offset, offset + chunkSize);
          const lengthBuffer = Buffer.alloc(4);
          lengthBuffer.writeUInt32BE(chunk.length, 0);
          socket.write(lengthBuffer);
          socket.write(chunk);
        }
        const endBuffer = Buffer.alloc(4);
        endBuffer.writeUInt32BE(0, 0);
        socket.write(endBuffer);
      });
    });
  }
}
