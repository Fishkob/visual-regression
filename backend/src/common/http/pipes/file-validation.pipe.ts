import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { KIND_MIME_TYPES } from '@common/domain/test-kind';

const ALLOWED_UPLOAD_MIME_TYPES = Object.values(KIND_MIME_TYPES);

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly appConfig: AppConfigService) {}

  transform(value?: Express.Multer.File): Express.Multer.File {
    if (!value) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(value.mimetype)) {
      throw new BadRequestException(
        `Invalid mime type: ${value.mimetype}. Allowed: ${ALLOWED_UPLOAD_MIME_TYPES.join(', ')}`,
      );
    }

    if (value.size > this.appConfig.screenshotMaxSize) {
      throw new HttpException(
        `File too large. Max size is ${String(this.appConfig.screenshotMaxSize)} bytes`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    if (value.mimetype === KIND_MIME_TYPES.image) {
      const buf = value.buffer;
      if (buf.length < 8) {
        throw new BadRequestException('Invalid PNG: buffer too small');
      }
      const PNG_SIG = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const header = buf.subarray(0, 8);
      const isPng = PNG_SIG.equals(header);
      if (!isPng) {
        throw new BadRequestException('Invalid PNG signature');
      }
    }

    if (value.mimetype === KIND_MIME_TYPES.pdf) {
      const buf = value.buffer;
      if (buf.length < 4) {
        throw new BadRequestException('Invalid PDF: buffer too small');
      }
      const header = buf.toString('ascii', 0, 4);
      if (header !== '%PDF') {
        throw new BadRequestException('Invalid PDF signature');
      }
    }

    return value;
  }
}
