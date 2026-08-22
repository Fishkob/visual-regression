import { BadRequestException } from '@nestjs/common';
export const NAME_REGEXP = /^[a-zA-Z0-9-_]+$/;
export const MAX_NAME_LENGTH = 100;
export const PROJECT_RESERVED_NAMES = ['pending'] as const;

export function validateName(
  value: string,
  reservedNames: readonly string[] = [],
): void {
  if (reservedNames.includes(value)) {
    throw new BadRequestException(
      `Name "${value}" is reserved and cannot be used`,
    );
  }
  if (value.length > MAX_NAME_LENGTH) {
    throw new BadRequestException(
      `Name too long (max ${MAX_NAME_LENGTH} characters)`,
    );
  }
  if (!NAME_REGEXP.test(value)) {
    throw new BadRequestException(
      'Only letters, numbers, hyphens and underscores are allowed',
    );
  }
}
