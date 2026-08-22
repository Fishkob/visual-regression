import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppLoggerService } from './app-logger.service';
@Global()
@Module({
  providers: [AppLoggerService, PinoLogger],
  exports: [AppLoggerService],
})
export class AppLoggerModule {}
