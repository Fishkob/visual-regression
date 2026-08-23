import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
describe('VariantFilterDto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates empty instance with no filters set', () => {
    const dto = new VariantFilterDto();
    expect(dto.viewport).toBeUndefined();
    expect(dto.browser).toBeUndefined();
    expect(dto.environment).toBeUndefined();
  });

  it('carries set fields', () => {
    const dto = new VariantFilterDto();
    dto.viewport = '1920x1080';
    dto.environment = 'staging';
    expect(dto.viewport).toBe('1920x1080');
    expect(dto.environment).toBe('staging');
    expect(dto.browser).toBeUndefined();
  });

  it('satisfies VariantFilter interface', () => {
    const dto: { viewport?: string; browser?: string; environment?: string } =
      new VariantFilterDto();
    expect(dto).toBeDefined();
  });
});
