import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { TEST_KINDS, TestKind } from '@common/domain/test-kind';

@Injectable()
export class TestKindValidationPipe implements PipeTransform<
  string | undefined,
  TestKind
> {
  transform(value: string | undefined): TestKind {
    if (!value || !TEST_KINDS.includes(value as TestKind)) {
      throw new BadRequestException(
        `Invalid testKind: ${String(value)}. Allowed: ${TEST_KINDS.join(', ')}`,
      );
    }
    return value as TestKind;
  }
}
