export type StateMachineStatus = string;

export type TransitionTable<T extends StateMachineStatus> = Partial<Record<T, readonly T[]>>;

export interface StateMachineConfig<T extends StateMachineStatus> {
  readonly id: string;
  readonly initial?: T;
  readonly terminal?: readonly T[];
  readonly transitions: TransitionTable<T>;
  readonly onBeforeTransition?: (from: T, to: T) => void | Promise<void>;
  readonly onAfterTransition?: (from: T, to: T) => void | Promise<void>;
}

export interface TransitionResult<T extends StateMachineStatus> {
  readonly from: T;
  readonly to: T;
  readonly changed: boolean;
  readonly terminal: boolean;
}

export class StateMachineError extends Error {
  constructor(
    message: string,
    readonly machineId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(message);
    this.name = 'StateMachineError';
  }
}

export class StateMachine<T extends StateMachineStatus> {
  constructor(private readonly config: StateMachineConfig<T>) {}

  get id(): string {
    return this.config.id;
  }

  canTransition(from: T, to: T): boolean {
    if (from === to) return true;
    const allowed = this.config.transitions[from] ?? [];
    return allowed.includes(to);
  }

  isTerminal(status: T): boolean {
    if (!this.config.terminal) return false;
    return this.config.terminal.includes(status);
  }

  assertTransition(from: T, to: T): void {
    if (this.canTransition(from, to)) return;
    throw new StateMachineError(
      `Invalid transition in ${this.config.id}: ${from} -> ${to}`,
      this.config.id,
      from,
      to,
    );
  }

  transition(from: T, to: T): TransitionResult<T> {
    this.assertTransition(from, to);
    const changed = from !== to;
    return {
      from,
      to,
      changed,
      terminal: this.isTerminal(to),
    };
  }
}

export function defineMachine<T extends StateMachineStatus>(config: StateMachineConfig<T>): StateMachine<T> {
  return new StateMachine(config);
}
