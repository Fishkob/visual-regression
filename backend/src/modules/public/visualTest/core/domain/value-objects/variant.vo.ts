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

  static hasFilters(filter?: VariantFilter): boolean {
    return Object.values(filter ?? {}).some((value) => value !== undefined);
  }

  static assertValidFilter(filter?: VariantFilter): void {
    for (const [key, value] of Object.entries(filter ?? {})) {
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new DomainError(
          `Variant filter "${key}" must be a non-empty string`,
          'BAD_REQUEST',
        );
      }
    }
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
    return filter ?? {};
  }
}
