import { Module } from '@nestjs/common';
import { AppLoggerModule } from '@common/logging/app-logger.module';
import { LogIngestionController } from './log-ingestion.controller';
import { LogIngestionService } from './log-ingestion.service';

@Module({
  imports: [AppLoggerModule],
  controllers: [LogIngestionController],
  providers: [LogIngestionService],
})
export class LogIngestionModule {}
