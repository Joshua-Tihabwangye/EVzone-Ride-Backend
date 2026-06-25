import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { AccessTokenVerifierService } from '../src/auth/access-token-verifier.service';

function token(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('AccessTokenVerifierService', () => {
  const secret = 'fleet-contract-token-secret';
  const config = {
    get: jest.fn((key: string) => (key === 'JWT_SECRET' ? secret : undefined)),
  } as unknown as ConfigService;
  const verifier = new AccessTokenVerifierService(config);

  it('verifies existing local HS256 access tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = await verifier.verify(
      token({ sub: 'user-1', role: 'FLEET_PARTNER', exp: now + 60 }, secret),
    );
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('FLEET_PARTNER');
  });

  it('rejects tampered and expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const valid = token({ sub: 'user-1', exp: now + 60 }, secret);
    await expect(
      verifier.verify(`${valid.slice(0, -1)}${valid.endsWith('x') ? 'y' : 'x'}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify(token({ sub: 'user-1', exp: now - 120 }, secret))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
