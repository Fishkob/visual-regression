import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';

export interface UploadParams {
  projectName: string;
  testName: string;
  branch?: string;
  targetBranch?: string;
  viewport: string;
  browser: string;
  environment: string;
  file: Express.Multer.File;
  runKey?: string;
  commitSha?: string;
  commitMessage?: string;
  ciUrl?: string;
  // Config-as-code tolerance for this variant. Applied when the upload creates
  // the baseline; on an existing baseline it may only lower the current value.
  pixelDiffThreshold?: number;
  // The uploading principal (API-key name or username), for the audit row a
  // config threshold change writes.
  actor?: string;
}

export function toVariant(params: UploadParams): Variant {
  return Variant.fromStrings(
    params.viewport,
    params.browser,
    params.environment,
  );
}
