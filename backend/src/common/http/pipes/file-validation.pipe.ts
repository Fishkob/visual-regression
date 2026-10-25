import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { MAX_IMAGE_PIXELS } from '@config/upload-limits';
import { KIND_MIME_TYPES } from '@common/domain/test-kind';
import { isPngSignature, readPngDimensions } from '@common/utils/png-header';

const ALLOWED_UPLOAD_MIME_TYPES = Object.values(KIND_MIME_TYPES);
const PNG_HEADER_BYTES = 24;

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
      if (buf.length < PNG_HEADER_BYTES) {
        throw new BadRequestException('Invalid PNG: buffer too small');
      }
      if (!isPngSignature(buf)) {
        throw new BadRequestException('Invalid PNG signature');
      }
      const dimensions = readPngDimensions(buf);
      if (!dimensions) {
        throw new BadRequestException('Invalid PNG: missing or invalid IHDR');
      }
      if (dimensions.width > MAX_IMAGE_PIXELS / dimensions.height) {
        throw new BadRequestException(
          `Image too large: ${String(dimensions.width)}x${String(dimensions.height)}. Maximum is ${String(MAX_IMAGE_PIXELS)} pixels`,
        );
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
