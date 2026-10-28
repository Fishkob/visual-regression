import { VariantRecord, VariantJson } from '@common/domain/variant-record';
import { DomainError } from '@common/domain/domain-error';

export type VariantFilter = Partial<VariantRecord>;

export const MAX_VARIANT_FIELD_LENGTH = 100;

export { VariantRecord, VariantJson };

export class Variant {
  private readonly viewportValue: string;
  private readonly browserName: string;
  private readonly environmentName: string;

  private constructor(
    viewportStr: string,
    browserStr: string,
    environmentStr: string,
  ) {
    if (!viewportStr || viewportStr.trim().length === 0) {
      throw new DomainError('Viewport must not be empty', 'BAD_REQUEST');
    }
    if (!browserStr || browserStr.trim().length === 0) {
      throw new DomainError('Browser must not be empty', 'BAD_REQUEST');
    }
    if (!environmentStr || environmentStr.trim().length === 0) {
      throw new DomainError('Environment must not be empty', 'BAD_REQUEST');
    }
    this.viewportValue = viewportStr;
    this.browserName = browserStr;
    this.environmentName = environmentStr;
    Object.freeze(this);
  }

  static fromStrings(
    viewportStr: string,
    browserStr: string,
    environmentStr: string,
  ): Variant {
    return new Variant(viewportStr, browserStr, environmentStr);
  }

  get viewport(): string {
    return this.viewportValue;
  }

  get browser(): string {
    return this.browserName;
  }

  get environment(): string {
    return this.environmentName;
  }

  // Returns the VariantJson shape (VariantRecord + index signature) so the
  // record can flow directly into JSON payloads (job data, event payloads)
  // that Prisma's InputJsonValue requires.
  toRecord(): VariantJson {
    return {
      viewport: this.viewport,
      browser: this.browser,
      environment: this.environment,
    };
  }

  static fromRecord(record: VariantRecord): Variant {
    return Variant.fromStrings(
      record.viewport,
      record.browser,
      record.environment,
    );
  }

  // Only the three variant coordinates count as a variant filter. A request DTO
  // may carry sibling route parameters (branch) in the same object; treating
  // those as filters used to satisfy the "filters required" rule and resolve an
  // arbitrary variant, so the key list is explicit here rather than derived
  // from Object.entries().
  private static readonly filterKeys = [
    'viewport',
    'browser',
    'environment',
  ] as const satisfies readonly (keyof VariantRecord)[];

  static hasFilters(filter?: VariantFilter): boolean {
    return this.filterKeys.some((key) => filter?.[key] !== undefined);
  }

  static assertValidFilter(filter?: VariantFilter): void {
    for (const key of this.filterKeys) {
      const value = filter?.[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new DomainError(
          `Variant filter "${key}" must be a non-empty string`,
          'BAD_REQUEST',
        );
      }
    }
  }

  // The filter a repository may act on: the three variant coordinates only, so
  // an unrelated parameter can never leak into a variant-scoped query.
  private static pickFilter(filter?: VariantFilter): VariantFilter {
    const picked: VariantFilter = {};
    for (const key of this.filterKeys) {
      const value = filter?.[key];
      if (value !== undefined) picked[key] = value;
    }
    return picked;
  }

  // Single validation rule for "the variant filters are present and valid":
  // an empty filter set is rejected, and any present-but-empty value (e.g. an
  // empty query string) is rejected rather than being dropped by the query
  // mapper — otherwise a partial filter silently resolves an arbitrary variant.
  static resolveRequiredFilter(filter?: VariantFilter): VariantFilter {
    this.assertValidFilter(filter);
    if (!this.hasFilters(filter)) {
      throw new DomainError(
        'Variant filters (viewport/browser/environment) are required',
        'BAD_REQUEST',
      );
    }
    return this.pickFilter(filter);
  }
}
