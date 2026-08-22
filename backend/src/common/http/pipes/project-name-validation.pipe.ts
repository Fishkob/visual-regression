import { Injectable, PipeTransform } from '@nestjs/common';
import { PROJECT_RESERVED_NAMES, validateName } from './name-validation.util';
@Injectable()
export class ProjectNameValidationPipe implements PipeTransform<string> {
  transform(value: string): string {
    validateName(value, PROJECT_RESERVED_NAMES);
    return value;
  }
}
