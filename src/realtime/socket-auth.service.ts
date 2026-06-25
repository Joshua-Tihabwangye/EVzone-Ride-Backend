import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AccessTokenVerifierService } from '../auth/access-token-verifier.service';
import { AuthService } from '../auth/auth.service';
import { ServiceType, UserRole } from '../common/enums';
import { JwtPayload } from '../common/interfaces';
import { RealtimeAccessService } from './realtime-access.service';

const SERVICE_ALIASES: Record<string, ServiceType> = {
  RIDE: ServiceType.RIDE,
  RIDES: ServiceType.RIDE,
  TRIP: ServiceType.RIDE,
  TRIPS: ServiceType.RIDE,
  DELIVERY: ServiceType.DELIVERY,
  DELIVERIES: ServiceType.DELIVERY,
  PARCEL: ServiceType.DELIVERY,
  TOURIST: ServiceType.TOURIST_VEHICLE,
  TOURIST_VEHICLE: ServiceType.TOURIST_VEHICLE,
  TOURISTVEHICLE: ServiceType.TOURIST_VEHICLE,
  AMBULANCE: ServiceType.AMBULANCE,
  CAR_RENTAL: ServiceType.CAR_RENTAL,
  CARRENTAL: ServiceType.CAR_RENTAL,
  RENTAL: ServiceType.CAR_RENTAL,
  SCHOOL_SHUTTLE: ServiceType.SCHOOL_SHUTTLE,
  SCHOOLSHUTTLE: ServiceType.SCHOOL_SHUTTLE,
};

export function normalizeRealtimeServiceType(value: string): ServiceType {
  const key = value.trim().replaceAll('-', '_').replaceAll(' ', '_').toUpperCase();
  const serviceType = SERVICE_ALIASES[key];
  if (!serviceType) throw new Error(`Unsupported service channel: ${value}`);
  return serviceType;
}

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly verifier: AccessTokenVerifierService,
    private readonly authService: AuthService,
    private readonly access: RealtimeAccessService,
  ) {}

  async authenticate(client: Socket, allowedRoles?: UserRole[]): Promise<JwtPayload> {
    const header = client.handshake.headers.authorization;
    const queryToken =
      typeof client.handshake.query.token === 'string' ? client.handshake.query.token : undefined;
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (header?.startsWith('Bearer ') ? header.slice(7) : undefined) ??
      queryToken;
    if (!token) throw new Error('Missing token');
    const decoded = await this.verifier.verify(token);
    const activeUser = await this.authService.validateAccessClaims(decoded);
    const payload: JwtPayload = {
      sub: activeUser.id,
      role: activeUser.role,
      email: activeUser.email,
      phone: activeUser.phone,
      firstName: activeUser.firstName,
      lastName: activeUser.lastName,
    };
    if (allowedRoles && !allowedRoles.includes(payload.role)) throw new Error('Role not allowed');
    client.data.user = payload;
    await client.join(`user:${payload.sub}`);
    await client.join(`role:${payload.role}`);
    return payload;
  }

  user(client: Socket): JwtPayload {
    const user = client.data.user as JwtPayload | undefined;
    if (!user) throw new Error('Socket is not authenticated');
    return user;
  }

  serviceIdentity(payload: { channel?: string; serviceType?: string; id?: string; serviceId?: string }): {
    serviceType: ServiceType;
    serviceId: string;
  } {
    const rawType = payload.serviceType ?? payload.channel;
    const serviceId = payload.serviceId ?? payload.id;
    if (!rawType || !serviceId) throw new Error('serviceType/channel and serviceId/id are required');
    return { serviceType: normalizeRealtimeServiceType(rawType), serviceId };
  }

  async authorizedServiceRoom(
    client: Socket,
    payload: { channel?: string; serviceType?: string; id?: string; serviceId?: string },
  ): Promise<string> {
    const user = this.user(client);
    const identity = this.serviceIdentity(payload);
    await this.access.assertAccess(user, identity.serviceType, identity.serviceId);
    return this.access.room(identity.serviceType, identity.serviceId);
  }

  async joinActiveServiceRooms(client: Socket, user: JwtPayload): Promise<string[]> {
    const rooms = await this.access.activeRooms(user);
    for (const room of rooms) await client.join(room);
    return rooms;
  }

  serviceRoom(payload: { channel?: string; serviceType?: string; id?: string; serviceId?: string }): string {
    const identity = this.serviceIdentity(payload);
    return `service:${identity.serviceType}:${identity.serviceId}`;
  }
}
