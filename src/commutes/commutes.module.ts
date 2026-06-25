import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { CommutesController } from './commutes.controller';
import { CommutesService } from './commutes.service';

@Module({
  imports: [RidesModule],
  controllers: [CommutesController],
  providers: [CommutesService],
  exports: [CommutesService],
})
export class CommutesModule {}
