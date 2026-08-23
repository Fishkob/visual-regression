import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';

export interface UploadParams {
  projectName: string;
  testName: string;
  viewport: string;
  browser: string;
  environment: string;
  file: Express.Multer.File;
}

export function toVariant(params: UploadParams): Variant {
  return Variant.fromStrings(
    params.viewport,
    params.browser,
    params.environment,
  );
}
