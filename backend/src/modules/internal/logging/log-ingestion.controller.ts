import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { LogIngestionService } from './log-ingestion.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('log')
export class LogIngestionController {
  constructor(private readonly logIngestion: LogIngestionService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiExcludeEndpoint()
  ingest(@Body() body: Record<string, unknown>, @Req() req: Request): void {
    this.logIngestion.ingest(body, req);
  }
}
