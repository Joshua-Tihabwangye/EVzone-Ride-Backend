import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DriversModule } from '../drivers/drivers.module';
import { FleetPortalModule } from '../fleet-portal/fleet-portal.module';
import { RidesModule } from '../rides/rides.module';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { AgentRealtimeGateway } from './agent-realtime.gateway';
import { DriverRealtimeGateway } from './driver-realtime.gateway';
import { FleetRealtimeGateway } from './fleet-realtime.gateway';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimeGateway } from './realtime.gateway';
import { RiderRealtimeGateway } from './rider-realtime.gateway';
import { SocketAuthService } from './socket-auth.service';

@Module({
  imports: [AuthModule, DriversModule, RidesModule, DeliveriesModule, FleetPortalModule],
  providers: [
    RealtimeAccessService,
    SocketAuthService,
    RealtimeGateway,
    DriverRealtimeGateway,
    FleetRealtimeGateway,
    RiderRealtimeGateway,
    AdminRealtimeGateway,
    AgentRealtimeGateway,
  ],
  exports: [
    RealtimeAccessService,
    RealtimeGateway,
    DriverRealtimeGateway,
    FleetRealtimeGateway,
    RiderRealtimeGateway,
    AdminRealtimeGateway,
    AgentRealtimeGateway,
  ],
})
export class RealtimeModule {}
