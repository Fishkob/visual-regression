import { DomainError } from '@common/domain/domain-error';
describe('DomainError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates error with message and code', () => {
      const error = new DomainError('test error', 'BAD_REQUEST');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DomainError');
      expect(error.message).toBe('test error');
      expect(error.code).toBe('BAD_REQUEST');
    });

    it('creates error with only message', () => {
      const error = new DomainError('minimal');

      expect(error.message).toBe('minimal');
      expect(error.code).toBeUndefined();
    });
  });
});
