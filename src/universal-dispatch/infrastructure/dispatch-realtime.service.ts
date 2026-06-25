import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DispatchRealtimeService {
  constructor(private readonly events: EventEmitter2) {}

  async emit(topic: string, room: string, event: string, payload: Record<string, unknown>): Promise<void> {
    this.events.emit('realtime.broadcast', { topic, room, event, payload });
  }

  async publishRequestUpdate(
    requestId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.emit('request', requestId, event, payload);
  }

  async publishDriverUpdate(
    driverId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.emit('driver', driverId, event, payload);
  }

  async publishDispatchUnitUpdate(
    dispatchUnitId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.emit('dispatch-unit', dispatchUnitId, event, payload);
  }

  async publishTripUpdate(
    tripSessionId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.emit('trip', tripSessionId, event, payload);
  }
}
