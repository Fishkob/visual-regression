import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';
describe('AppModule', () => {
  beforeEach(() => {
    process.env.POSTGRES_USER = 'test';
    process.env.POSTGRES_PASSWORD = 'test';
    process.env.POSTGRES_DB = 'test';
    process.env.RUSTFS_ENDPOINT = 'localhost';
    process.env.RUSTFS_ACCESS_KEY = 'test';
    process.env.RUSTFS_SECRET_KEY = 'test';
    process.env.RUSTFS_BUCKET = 'test';
    process.env.RUSTFS_PUBLIC_URL = 'http://localhost:9000';
    process.env.CORS_ORIGIN = '*';
    process.env.DATABASE_URL = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compiles without errors (no circular deps, all imports resolved)', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module).toBeDefined();
  });
});
