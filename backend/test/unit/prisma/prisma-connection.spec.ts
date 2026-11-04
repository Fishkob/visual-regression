import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from '@/prisma/client';

const { MockPrismaClient, MockPrismaPg } = vi.hoisted(() => {
  const clientMethods = function (this: Record<string, unknown>) {
    this.$transaction = vi.fn();
    this.$queryRaw = vi.fn();
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
  };
  return {
    MockPrismaClient: vi.fn().mockImplementation(clientMethods),
    MockPrismaPg: vi.fn().mockImplementation(function (opts: {
      connectionString: string;
    }) {
      return { connectionString: opts.connectionString };
    }),
  };
});

vi.mock('@/prisma/client', () => ({ PrismaClient: MockPrismaClient }));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: MockPrismaPg }));

describe('PrismaConnection', () => {
  const appConfig = {
    database: {
      url: 'postgresql://test:test@localhost:5432/test',
      poolMax: 7,
    },
  };

  function createConnection(): PrismaConnection {
    return new PrismaConnection(appConfig as never);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the client from the configured connection string', () => {
    const connection = createConnection();

    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: 'postgresql://test:test@localhost:5432/test',
      max: 7,
      options: '-c timezone=UTC',
    });
    expect(PrismaClient).toHaveBeenCalledWith({ adapter: expect.anything() });
    expect(connection.client).toBeInstanceOf(PrismaClient);
  });

  // A `timestamp(3)` column carries no zone, so the session's zone is what turns
  // a `Date` into the stored value. The pin is the only thing keeping every
  // timestamp in the schema UTC on a database whose server zone is not, and the
  // adapter config is where it is stated — which is what this asserts.
  it('pins the session time zone of every pooled connection to UTC', () => {
    createConnection();

    expect(PrismaPg).toHaveBeenCalledWith(
      expect.objectContaining({ options: '-c timezone=UTC' }),
    );
  });

  it('forwards transactions to the underlying client', () => {
    const connection = createConnection();
    const fn = vi.fn();

    void connection.$transaction(fn, { isolationLevel: 'Serializable' });

    expect(connection.client.$transaction).toHaveBeenCalledWith(fn, {
      isolationLevel: 'Serializable',
    });
  });

  it('forwards raw queries to the underlying client', () => {
    const connection = createConnection();
    const query = 'SELECT 1' as unknown as Prisma.Sql;

    void connection.$queryRaw(query, 'arg');

    expect(connection.client.$queryRaw).toHaveBeenCalledWith(query, 'arg');
  });

  it('connects on init', async () => {
    const connection = createConnection();

    await connection.onModuleInit();

    expect(connection.client.$connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects on destroy', async () => {
    const connection = createConnection();

    await connection.onModuleDestroy();

    expect(connection.client.$disconnect).toHaveBeenCalledTimes(1);
  });
});
