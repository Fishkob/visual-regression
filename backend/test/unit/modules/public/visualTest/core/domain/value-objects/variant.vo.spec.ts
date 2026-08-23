import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { DomainError } from '@common/domain/domain-error';
describe('Variant', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fromStrings', () => {
    it('creates variant from strings', () => {
      const v = Variant.fromStrings('1920x1080', 'Chrome', 'production');
      expect(v.viewport).toBe('1920x1080');
      expect(v.browser).toBe('Chrome');
      expect(v.environment).toBe('production');
    });

    it('creates variant without browser version', () => {
      const v = Variant.fromStrings('1024x768', 'Chrome', 'staging');
      expect(v.browser).toBe('Chrome');
    });

    it('throws for empty viewport', () => {
      expect(() => Variant.fromStrings('', 'Chrome', 'prod')).toThrow(
        new DomainError('Viewport must not be empty', 'BAD_REQUEST'),
      );
    });

    it('throws for whitespace viewport', () => {
      expect(() => Variant.fromStrings('   ', 'Chrome', 'prod')).toThrow(
        'Viewport must not be empty',
      );
    });

    it('throws for empty browser', () => {
      expect(() => Variant.fromStrings('1024x768', '', 'prod')).toThrow(
        'Browser must not be empty',
      );
    });

    it('throws for whitespace browser', () => {
      expect(() => Variant.fromStrings('1024x768', '   ', 'prod')).toThrow(
        'Browser must not be empty',
      );
    });

    it('throws for empty environment', () => {
      expect(() => Variant.fromStrings('1024x768', 'Chrome', '')).toThrow(
        'Environment must not be empty',
      );
    });

    it('throws for whitespace environment', () => {
      expect(() => Variant.fromStrings('1024x768', 'Chrome', '   ')).toThrow(
        'Environment must not be empty',
      );
    });
  });

  describe('toRecord', () => {
    it('returns flat record of variant values', () => {
      const v = Variant.fromStrings('1920x1080', 'Chrome', 'production');
      expect(v.toRecord()).toEqual({
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'production',
      });
    });

    it('includes browser name in record', () => {
      const v = Variant.fromStrings('1920x1080', 'Chrome', 'production');
      expect(v.toRecord().browser).toBe('Chrome');
    });
  });

  describe('hasFilters', () => {
    it('is false when no filters are given', () => {
      expect(Variant.hasFilters(undefined)).toBe(false);
      expect(Variant.hasFilters({})).toBe(false);
    });

    it('is true when a filter key is present even if its value is empty', () => {
      expect(Variant.hasFilters({ viewport: '' })).toBe(true);
    });

    it('is true when any key holds a real value', () => {
      expect(Variant.hasFilters({ viewport: '1920x1080' })).toBe(true);
    });
  });

  describe('assertValidFilter', () => {
    it('accepts undefined and empty filters', () => {
      expect(() => Variant.assertValidFilter(undefined)).not.toThrow();
      expect(() => Variant.assertValidFilter({})).not.toThrow();
    });

    it('accepts non-empty string filters', () => {
      expect(() =>
        Variant.assertValidFilter({ viewport: '1920x1080' }),
      ).not.toThrow();
      expect(() =>
        Variant.assertValidFilter({
          viewport: '1920x1080',
          browser: 'chromium',
        }),
      ).not.toThrow();
    });

    it('rejects a present-but-empty filter value', () => {
      expect(() => Variant.assertValidFilter({ viewport: '' })).toThrow(
        DomainError,
      );
      expect(() => Variant.assertValidFilter({ browser: '   ' })).toThrow(
        DomainError,
      );
    });

    it('rejects when all provided filter values are empty', () => {
      expect(() =>
        Variant.assertValidFilter({ viewport: '', environment: '' }),
      ).toThrow(DomainError);
    });
  });

  describe('resolveRequiredFilter', () => {
    it('returns the filter when at least one non-empty value is present', () => {
      const filters = { viewport: '1920x1080' };
      expect(Variant.resolveRequiredFilter(filters)).toEqual(filters);
    });

    it('rejects an empty filter set as required', () => {
      expect(() => Variant.resolveRequiredFilter(undefined)).toThrow(
        new DomainError(
          'Variant filters (viewport/browser/environment) are required',
          'BAD_REQUEST',
        ),
      );
      expect(() => Variant.resolveRequiredFilter({})).toThrow(DomainError);
    });

    it('rejects a present-but-empty filter value', () => {
      expect(() => Variant.resolveRequiredFilter({ viewport: '' })).toThrow(
        new DomainError(
          'Variant filter "viewport" must be a non-empty string',
          'BAD_REQUEST',
        ),
      );
    });
  });
});
