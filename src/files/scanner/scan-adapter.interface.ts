export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'ERROR';
  reason?: string;
  details?: Record<string, unknown>;
}

export interface ScanAdapter {
  readonly providerName: string;
  scan(buffer: Buffer, metadata?: Record<string, unknown>): Promise<ScanResult>;
}
