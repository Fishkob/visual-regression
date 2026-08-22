import { Global, Module } from '@nestjs/common';
import { Tracker } from './tracker.service';
@Global()
@Module({
  providers: [Tracker],
  exports: [Tracker],
})
export class TrackerModule {}
