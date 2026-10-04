import { ValidationPipe } from '@nestjs/common';

// The single source of truth for request validation. main.ts (runtime) and the
// e2e harness both build from here so production and tests cannot drift.
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    forbidUnknownValues: true,
  });
}
