import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JsonWebKey as CryptoJsonWebKey,
  KeyObject,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';

export type AccessTokenClaims = Record<string, unknown> & {
  sub: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
};

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwksDocument = {
  keys?: Array<CryptoJsonWebKey & { kid?: string; alg?: string; use?: string }>;
};

@Injectable()
export class AccessTokenVerifierService {
  private readonly keyCache = new Map<string, { key: KeyObject; expiresAt: number }>();
  private jwksUriCache?: { uri: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<AccessTokenClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Malformed access token');

    const header = this.decodeJson<JwtHeader>(parts[0]);
    const claims = this.decodeJson<AccessTokenClaims>(parts[1]);
    if (!claims.sub || typeof claims.sub !== 'string') {
      throw new UnauthorizedException('Access token has no subject');
    }

    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = this.decodeBase64Url(parts[2]);
    const algorithm = header.alg?.toUpperCase();

    if (algorithm === 'HS256') {
      this.verifyHs256(signingInput, signature);
    } else if (algorithm === 'RS256' || algorithm === 'RS384' || algorithm === 'RS512') {
      await this.verifyRsa(algorithm, header.kid, signingInput, signature);
      this.validateExternalIssuerAndAudience(claims);
    } else {
      throw new UnauthorizedException(`Unsupported access token algorithm: ${algorithm ?? 'unknown'}`);
    }

    this.validateTimes(claims);
    return claims;
  }

  private verifyHs256(signingInput: string, signature: Buffer): void {
    const secret = this.config.get<string>('JWT_SECRET') ?? 'evzone-local-access-secret-change-in-production';
    const expected = createHmac('sha256', secret).update(signingInput).digest();
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
      throw new UnauthorizedException('Invalid access token signature');
    }
  }

  private async verifyRsa(
    algorithm: 'RS256' | 'RS384' | 'RS512',
    kid: string | undefined,
    signingInput: string,
    signature: Buffer,
  ): Promise<void> {
    if (!kid) throw new UnauthorizedException('OIDC access token has no key identifier');
    const key = await this.getSigningKey(kid);
    const digest = algorithm === 'RS256' ? 'RSA-SHA256' : algorithm === 'RS384' ? 'RSA-SHA384' : 'RSA-SHA512';
    const valid = verifySignature(digest, Buffer.from(signingInput), key, signature);
    if (!valid) throw new UnauthorizedException('Invalid OIDC access token signature');
  }

  private validateTimes(claims: AccessTokenClaims): void {
    const now = Math.floor(Date.now() / 1000);
    const clockTolerance = Number(this.config.get('JWT_CLOCK_TOLERANCE_SECONDS') ?? 30);
    if (typeof claims.exp === 'number' && claims.exp < now - clockTolerance) {
      throw new UnauthorizedException('Access token has expired');
    }
    if (typeof claims.nbf === 'number' && claims.nbf > now + clockTolerance) {
      throw new UnauthorizedException('Access token is not active yet');
    }
  }

  private validateExternalIssuerAndAudience(claims: AccessTokenClaims): void {
    const expectedIssuer = (
      this.config.get<string>('OIDC_ISSUER') ??
      this.config.get<string>('OIDC_AUTHORITY') ??
      ''
    ).replace(/\/+$/, '');
    if (expectedIssuer) {
      const actualIssuer = String(claims.iss ?? '').replace(/\/+$/, '');
      if (actualIssuer !== expectedIssuer) throw new UnauthorizedException('OIDC issuer is not trusted');
    }

    const expectedAudience = this.config.get<string>('OIDC_AUDIENCE');
    if (expectedAudience) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
      if (!audiences.includes(expectedAudience)) throw new UnauthorizedException('OIDC audience is invalid');
    }
  }

  private async getSigningKey(kid: string): Promise<KeyObject> {
    const cached = this.keyCache.get(kid);
    if (cached && cached.expiresAt > Date.now()) return cached.key;

    const jwksUri = await this.getJwksUri();
    const response = await fetch(jwksUri, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new UnauthorizedException(`Unable to load OIDC keys (HTTP ${response.status})`);
    const document = (await response.json()) as JwksDocument;
    const jwk = document.keys?.find((entry) => entry.kid === kid);
    if (!jwk) throw new UnauthorizedException('OIDC signing key was not found');

    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const ttl = Number(this.config.get('OIDC_JWKS_CACHE_SECONDS') ?? 3600) * 1000;
    this.keyCache.set(kid, { key, expiresAt: Date.now() + ttl });
    return key;
  }

  private async getJwksUri(): Promise<string> {
    const configured = this.config.get<string>('OIDC_JWKS_URI');
    if (configured) return configured;
    if (this.jwksUriCache && this.jwksUriCache.expiresAt > Date.now()) return this.jwksUriCache.uri;

    const authority = (
      this.config.get<string>('OIDC_AUTHORITY') ??
      this.config.get<string>('OIDC_ISSUER') ??
      'https://accounts.evzone.app'
    ).replace(/\/+$/, '');
    const discoveryUrl = `${authority}/.well-known/openid-configuration`;
    const response = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok)
      throw new UnauthorizedException(`Unable to load OIDC discovery (HTTP ${response.status})`);
    const document = (await response.json()) as { jwks_uri?: string };
    if (!document.jwks_uri) throw new UnauthorizedException('OIDC discovery has no jwks_uri');
    this.jwksUriCache = { uri: document.jwks_uri, expiresAt: Date.now() + 3_600_000 };
    return document.jwks_uri;
  }

  private decodeJson<T>(value: string): T {
    try {
      return JSON.parse(this.decodeBase64Url(value).toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException('Malformed access token payload');
    }
  }

  private decodeBase64Url(value: string): Buffer {
    try {
      if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error('Invalid base64url alphabet');
      }
      const decoded = Buffer.from(value, 'base64url');
      if (decoded.toString('base64url') !== value) {
        throw new Error('Non-canonical base64url encoding');
      }
      return decoded;
    } catch {
      throw new UnauthorizedException('Malformed access token encoding');
    }
  }
}
