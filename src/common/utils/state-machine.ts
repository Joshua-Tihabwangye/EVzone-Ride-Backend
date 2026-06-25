import { BadRequestException } from '@nestjs/common';

export function assertTransition<T extends string>(
  current: T,
  next: T,
  transitions: Partial<Record<T, readonly T[]>>,
): void {
  const allowed = transitions[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BadRequestException(`Invalid status transition from ${current} to ${next}`);
  }
}
