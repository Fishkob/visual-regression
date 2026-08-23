import { BadRequestException } from '@nestjs/common';
import {
  MAX_NAME_LENGTH,
  validateName,
} from '@common/http/pipes/name-validation.util';
describe('name-validation.util', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateName', () => {
    it('passes for valid names with letters', () => {
      expect(() => validateName('myProject')).not.toThrow();
    });

    it('passes for valid names with numbers', () => {
      expect(() => validateName('test123')).not.toThrow();
    });

    it('passes for names with hyphens and underscores', () => {
      expect(() => validateName('my-project_test')).not.toThrow();
    });

    it('throws when name exceeds max length', () => {
      const longName = 'a'.repeat(MAX_NAME_LENGTH + 1);
      expect(() => validateName(longName)).toThrow(BadRequestException);
      expect(() => validateName(longName)).toThrow('too long');
    });

    it('accepts name at exactly max length', () => {
      expect(() => validateName('a'.repeat(MAX_NAME_LENGTH))).not.toThrow();
    });

    it('throws for special characters', () => {
      expect(() => validateName('my/project')).toThrow(BadRequestException);
      expect(() => validateName('my.project')).toThrow(BadRequestException);
      expect(() => validateName('my project')).toThrow(BadRequestException);
    });

    it('throws for special characters with correct message', () => {
      expect(() => validateName('test!')).toThrow(
        'Only letters, numbers, hyphens and underscores',
      );
    });

    it('rejects a name in the reserved list when provided', () => {
      expect(() => validateName('pending', ['pending'])).toThrow(
        BadRequestException,
      );
      expect(() => validateName('pending', ['pending'])).toThrow('reserved');
    });

    it('ignores the reserved list when the name is not in it', () => {
      expect(() => validateName('checkout', ['pending'])).not.toThrow();
    });

    it('treats a name as valid when no reserved list is given', () => {
      expect(() => validateName('pending')).not.toThrow();
    });
  });
});
