import { Injectable, PipeTransform } from '@nestjs/common';
import { validateName } from './name-validation.util';
@Injectable()
export class ProjectTestNameValidationPipe implements PipeTransform<string> {
  transform(value: string): string {
    validateName(value);
    return value;
  }
}
