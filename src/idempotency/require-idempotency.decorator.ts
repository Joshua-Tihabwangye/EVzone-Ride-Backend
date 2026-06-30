import { SetMetadata } from '@nestjs/common';

export const REQUIRE_IDEMPOTENCY_KEY = 'requireIdempotency';

/**
 * Marks a controller or handler as requiring an `Idempotency-Key` header.
 * The {@link IdempotencyGuard} will reject the request with a 400 when the
 * header is missing, empty, or too short.
 */
export const RequireIdempotency = () => SetMetadata(REQUIRE_IDEMPOTENCY_KEY, true);
