import { Injectable } from '@nestjs/common';
import { defineMachine, StateMachine, StateMachineConfig, StateMachineStatus } from './state-machine';

@Injectable()
export class StateMachineService {
  private readonly registry = new Map<string, StateMachine<StateMachineStatus>>();

  create<T extends StateMachineStatus>(config: StateMachineConfig<T>): StateMachine<T> {
    const machine = defineMachine(config);
    this.registry.set(machine.id, machine as unknown as StateMachine<StateMachineStatus>);
    return machine;
  }

  get<T extends StateMachineStatus>(id: string): StateMachine<T> | undefined {
    const machine = this.registry.get(id);
    return machine as StateMachine<T> | undefined;
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }
}
