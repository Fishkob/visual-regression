import { Test, TestingModule } from '@nestjs/testing';
import { LogIngestionController } from '@/modules/internal/logging/log-ingestion.controller';
import { LogIngestionService } from '@/modules/internal/logging/log-ingestion.service';
import type { Request } from 'express';
import { createMock } from '@test/utils/create-mock';

describe('LogIngestionController', () => {
  let controller: LogIngestionController;
  let logIngestion: jest.Mocked<LogIngestionService>;

  beforeEach(async () => {
    logIngestion = createMock<LogIngestionService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogIngestionController],
      providers: [{ provide: LogIngestionService, useValue: logIngestion }],
    }).compile();

    controller = module.get(LogIngestionController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates to logIngestion.ingest', () => {
    const body = { message: 'test' };
    const req = { headers: {} } as Request;

    controller.ingest(body, req);

    expect(logIngestion.ingest).toHaveBeenCalledWith(body, req);
  });
});
