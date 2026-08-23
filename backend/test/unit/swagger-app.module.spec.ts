import { Test } from '@nestjs/testing';
import { SwaggerAppModule } from '@/swagger-app.module';
describe('SwaggerAppModule', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compiles without errors (no circular deps, all imports resolved)', async () => {
    const module = await Test.createTestingModule({
      imports: [SwaggerAppModule],
    }).compile();

    expect(module).toBeDefined();
  });
});
