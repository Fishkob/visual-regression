import { Test } from '@nestjs/testing';
import { WorkerModule } from '@/worker.module';

describe('WorkerModule', () => {
  beforeEach(() => {
    process.env.POSTGRES_USER = 'test';
    process.env.POSTGRES_PASSWORD = 'test';
    process.env.POSTGRES_DB = 'test';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_ACCESS_KEY = 'test';
    process.env.MINIO_SECRET_KEY = 'test';
    process.env.MINIO_BUCKET = 'test';
    process.env.MINIO_PUBLIC_URL = 'http://localhost:9000';
    process.env.CORS_ORIGIN = '*';
    process.env.DATABASE_URL = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`;
  });

  it('should compile the worker graph standalone (every worker provider resolvable)', async () => {
    const module = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(module).toBeDefined();
  });
});
