import type { Mocked } from 'vitest';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { Readable } from 'node:stream';
import { createMock } from './create-mock';
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
  mock.delete = vi.fn();
  mock.deleteQuietly = vi.fn();
  mock.deleteAll = vi.fn();
  mock.listObjects = vi.fn();
  mock.listObjectsWithLastModified = vi.fn();
  return mock;
}

export function createMockUoW() {
  const mock = createMock();
  mock.execute = vi.fn(async (fn) => fn());
  return mock;
}
