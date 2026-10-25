import { bootstrapAdmin } from '@internal/auth/bootstrap-admin';

describe('bootstrap-admin', () => {
  let repo: {
    countUsers: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
  };
  let hasher: { hashPassword: ReturnType<typeof vi.fn> };
  let logger: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = { countUsers: vi.fn(), createUser: vi.fn() };
    hasher = { hashPassword: vi.fn() };
    logger = { warn: vi.fn(), error: vi.fn() };
  });

  function createService(appConfig: unknown) {
    return bootstrapAdmin(
      repo as never,
      hasher as never,
      appConfig as never,
      logger as never,
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the admin when no users exist and env is set', async () => {
    repo.countUsers.mockResolvedValue(0);
    hasher.hashPassword.mockResolvedValue('salt:hash');
    const appConfig = {
      auth: { bootstrapAdminUsername: 'admin', bootstrapAdminPassword: 'pw' },
    };

    await createService(appConfig);

    expect(hasher.hashPassword).toHaveBeenCalledWith('pw');
    expect(repo.createUser).toHaveBeenCalledWith('admin', 'salt:hash', {
      role: 'ADMIN',
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Remove'));
  });

  it('does nothing when users already exist', async () => {
    repo.countUsers.mockResolvedValue(1);
    const appConfig = {
      auth: { bootstrapAdminUsername: 'admin', bootstrapAdminPassword: 'pw' },
    };

    await createService(appConfig);

    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it('does nothing when env vars are not set', async () => {
    repo.countUsers.mockResolvedValue(0);
    const appConfig = {
      auth: { bootstrapAdminUsername: '', bootstrapAdminPassword: '' },
    };

    await createService(appConfig);

    expect(repo.createUser).not.toHaveBeenCalled();
  });
});
