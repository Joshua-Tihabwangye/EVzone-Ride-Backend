import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from './entities';
import { SeedService } from './seed.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([...ENTITIES])],
  providers: [SeedService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
