import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { PublicEndpoint } from '@common/http/public.decorator';
import { LogIngestionService } from './log-ingestion.service';

@ApiExcludeController()
@PublicEndpoint()
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
