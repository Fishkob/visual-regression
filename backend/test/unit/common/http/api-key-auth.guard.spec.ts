import { UnauthorizedException } from '@nestjs/common';
import {
  ApiKeyAuthGuard,
  type ApiKeyAuthOptions,
} from '@common/http/api-key-auth.guard';

describe('ApiKeyAuthGuard', () => {
  const options = {
    header: 'x-test-key',
    getApiKey: (config: { apiKey: string }) => config.apiKey,
    disabledMessage: 'API disabled',
    invalidMessage: 'Invalid API key',
  } as unknown as ApiKeyAuthOptions;

  const mockContext = (headers: Record<string, unknown> = {}) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as never;

  let appConfig: { apiKey: string };

  beforeEach(() => {
    appConfig = { apiKey: 'secret123' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createGuard(): ApiKeyAuthGuard {
    return new ApiKeyAuthGuard(appConfig as never, options);
  }

  it('denies every request when no api key is configured', () => {
    appConfig.apiKey = '';

    expect(() => createGuard().canActivate(mockContext())).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      createGuard().canActivate(mockContext({ 'x-test-key': 'secret123' })),
    ).toThrow('API disabled');
  });

  it('allows a request whose header matches the configured key', () => {
    expect(
      createGuard().canActivate(mockContext({ 'x-test-key': 'secret123' })),
    ).toBe(true);
  });

  it('throws when the header is missing', () => {
    expect(() => createGuard().canActivate(mockContext())).toThrow(
      'Invalid API key',
    );
  });

  it('throws when the header does not match', () => {
    expect(() =>
      createGuard().canActivate(mockContext({ 'x-test-key': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a key that differs in the last character', () => {
    expect(() =>
      createGuard().canActivate(mockContext({ 'x-test-key': 'secret124' })),
    ).toThrow('Invalid API key');
  });

  it('throws when the header is present but not a string', () => {
    expect(() =>
      createGuard().canActivate(mockContext({ 'x-test-key': ['secret123'] })),
    ).toThrow('Invalid API key');
  });
});
