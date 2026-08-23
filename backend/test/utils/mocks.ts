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

export function createMockLogger(): jest.Mocked<AppLoggerService> {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<AppLoggerService>;
}

export function createMockStorage() {
  const mock = createMock();
  mock.get = jest.fn();
  mock.putObject = jest.fn();
  mock.delete = jest.fn();
  mock.deleteQuietly = jest.fn();
  mock.deleteAll = jest.fn();
  mock.listObjects = jest.fn();
  mock.listObjectsWithLastModified = jest.fn();
  return mock;
}

export function createMockUoW() {
  const mock = createMock();
  mock.execute = jest.fn(async (fn) => fn());
  return mock;
}
