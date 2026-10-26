import type { Mocked } from 'vitest';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { Readable } from 'node:stream';
import { createMock } from './create-mock';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { DomainError } from '@common/domain/domain-error';
export function createMockFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  const buffer = Buffer.from('fake-image-content');

  const mockStream = new Readable({
    read() {
      this.push(null);
    },
  });

  return {
    fieldname: 'image',
    originalname: 'screenshot.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    stream: mockStream,
    buffer,
    destination: '',
    filename: 'screenshot.png',
    path: '',
    ...overrides,
  };
}

export function createMockLogger(): Mocked<AppLoggerService> {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Mocked<AppLoggerService>;
}

export function createMockStorage() {
  const mock = createMock();
  mock.get = vi.fn();
  mock.putObject = vi.fn();
  mock.exists = vi.fn();
  mock.healthCheck = vi.fn();
  mock.deleteQuietly = vi.fn();
  mock.deleteAll = vi.fn();
  mock.deletePrefix = vi.fn();
  mock.listObjectsWithLastModified = vi.fn();
  mock.toPublicUrl = vi.fn((name: string) => name);
  mock.fromUrl = vi.fn((url: string) => url);
  // Identity by default: a spec that does not care about signing keeps seeing
  // the stored URL, and one that does can override the implementation.
  mock.signUrl = vi.fn((url: string) => url);
  return mock;
}

// A ProjectRepository double whose `requireByName` behaves like the real one:
// it delegates to `findByName` and throws the domain 404 when that resolves
// nothing. Specs keep mocking the *query* (`findByName`), and the 404 shape comes
// for free — the alternative was every spec re-stating how "not found" is built.
export function createMockProjectRepository(): Mocked<ProjectRepository> {
  const mock = createMock<ProjectRepository>();
  mock.requireByName.mockImplementation(async (name: string) => {
    const project = await mock.findByName(name);
    if (!project) {
      throw new DomainError(`Project "${name}" not found`, 'NOT_FOUND');
    }
    return project;
  });
  return mock;
}

export function createMockUoW() {
  const mock = createMock();
  mock.execute = vi.fn(async (fn) => fn());
  return mock;
}
