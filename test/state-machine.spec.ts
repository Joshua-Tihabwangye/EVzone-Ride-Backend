import { BadRequestException } from '@nestjs/common';
import { assertTransition } from '../src/common/utils/state-machine';
import { defineMachine, StateMachine, StateMachineError } from '../src/state-machine';

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

describe('StateMachine class', () => {
  type Status = 'CREATED' | 'SEARCHING' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED';

  let machine: StateMachine<Status>;

  beforeEach(() => {
    machine = defineMachine<Status>({
      id: 'test',
      terminal: ['COMPLETED', 'CANCELLED'],
      transitions: {
        CREATED: ['SEARCHING', 'CANCELLED'],
        SEARCHING: ['ASSIGNED', 'CANCELLED'],
        ASSIGNED: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [],
        CANCELLED: [],
      },
    });
  });

  it('allows a valid transition', () => {
    const result = machine.transition('CREATED', 'SEARCHING');
    expect(result.from).toBe('CREATED');
    expect(result.to).toBe('SEARCHING');
    expect(result.changed).toBe(true);
    expect(result.terminal).toBe(false);
  });

  it('treats same-state as allowed and unchanged', () => {
    const result = machine.transition('CREATED', 'CREATED');
    expect(result.changed).toBe(false);
    expect(result.terminal).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(() => machine.transition('CREATED', 'COMPLETED')).toThrow(StateMachineError);
  });

  it('identifies terminal statuses', () => {
    expect(machine.isTerminal('COMPLETED')).toBe(true);
    expect(machine.isTerminal('SEARCHING')).toBe(false);
  });
});
