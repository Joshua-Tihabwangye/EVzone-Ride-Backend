import { BadRequestException } from '@nestjs/common';
import { assertTransition } from '../src/common/utils/state-machine';

describe('state machine guard', () => {
  const transitions = {
    REQUESTED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED'],
  } as const;

  it('allows declared transitions', () => {
    expect(() => assertTransition('REQUESTED', 'ACCEPTED', transitions)).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => assertTransition('REQUESTED', 'COMPLETED', transitions)).toThrow(BadRequestException);
  });
});
