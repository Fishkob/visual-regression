import {
  variantToWhere,
  variantResolutionWhere,
  variantFromRow,
} from '@public/visualTest/core/infrastructure/mappers/variant-row.mapper';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';

describe('variant-row.mapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('variantToWhere', () => {
    it('returns an empty clause when filters are undefined', () => {
      expect(variantToWhere(undefined)).toEqual({});
    });

    it('returns an empty clause when no filter fields are set', () => {
      expect(variantToWhere({})).toEqual({});
    });

    it('keeps only the provided viewport', () => {
      expect(variantToWhere({ viewport: '1920x1080' })).toEqual({
        viewport: '1920x1080',
      });
    });

    it('keeps only the provided browser', () => {
      expect(variantToWhere({ browser: 'chromium' })).toEqual({
        browser: 'chromium',
      });
    });

    it('keeps only the provided environment', () => {
      expect(variantToWhere({ environment: 'staging' })).toEqual({
        environment: 'staging',
      });
    });

    it('keeps all three fields when all are provided', () => {
      expect(
        variantToWhere({
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        }),
      ).toEqual({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      });
    });

    it('drops empty-string fields', () => {
      expect(
        variantToWhere({
          viewport: '',
          browser: 'chromium',
          environment: '',
        }),
      ).toEqual({ browser: 'chromium' });
    });
  });

  describe('variantResolutionWhere', () => {
    it('scopes the filter to the test id', () => {
      expect(
        variantResolutionWhere('test-1', { viewport: '1920x1080' }),
      ).toEqual({
        testId: 'test-1',
        viewport: '1920x1080',
      });
    });

    it('resolves to just the test scope when no filter fields are set', () => {
      expect(variantResolutionWhere('test-1', undefined)).toEqual({
        testId: 'test-1',
      });
    });
  });

  describe('variantFromRow', () => {
    it('builds a Variant from the related variant row', () => {
      const variant = variantFromRow({
        asBaseline: {
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        },
      });
      expect(variant.toRecord()).toEqual({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      });
    });

    it('throws when no related variant exists', () => {
      expect(() => variantFromRow(null)).toThrow(/variant relation/i);
    });

    it('throws when the row has no asBaseline', () => {
      expect(() => variantFromRow({})).toThrow(/variant relation/i);
    });
  });

  it('round-trips through the Variant record helpers', () => {
    const original = Variant.fromStrings('1280x800', 'firefox', 'prod');
    const fromRow = variantFromRow({ asBaseline: original.toRecord() });
    expect(fromRow.toRecord()).toEqual(original.toRecord());
  });
});
