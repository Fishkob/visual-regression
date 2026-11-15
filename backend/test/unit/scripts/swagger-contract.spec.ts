import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAIN_ERROR_REASONS } from '@common/domain/domain-error';

// The generated document is the SDK's input, so it is the contract, not an
// artefact beside it: an ErrorResponseDto that falls out of `extraModels` makes
// every generated error body `unknown`, and nothing else in the suite notices.
// This reads the committed file, so it fails until `swagger:export` is re-run
// after a reason is added.
const document = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'swagger.json'), 'utf8'),
) as {
  components: {
    schemas: Record<string, { properties?: Record<string, unknown> }>;
  };
};

describe('swagger contract', () => {
  it('publishes the error envelope so the SDK can type an error body', () => {
    expect(document.components.schemas.ErrorResponseDto).toBeDefined();
  });

  it('publishes every domain error reason and no stale one', () => {
    const reason = document.components.schemas.ErrorResponseDto?.properties
      ?.reason as { enum?: string[] } | undefined;

    expect(reason?.enum).toEqual([...DOMAIN_ERROR_REASONS]);
  });
});
