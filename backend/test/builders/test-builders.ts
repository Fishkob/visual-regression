import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { Readable } from 'node:stream';

interface ScreenshotData {
  id: string;
  visualTestId: string;
  type: ScreenshotType;
  imageHash: string;
  imageUrl: string;
  variant: Variant;
  pixelDiffThreshold: number;
  createdAt: Date;
}

export class ScreenshotBuilder {
  private data: ScreenshotData = {
    id: 'screenshot-001',
    visualTestId: 'vt-123',
    type: ScreenshotType.BASELINE,
    imageHash: 'hash-default',
    imageUrl: 'http://localhost/image.png',
    variant: Variant.fromStrings('1920x1080', 'Chrome', 'ci'),
    pixelDiffThreshold: 0,
    createdAt: new Date(),
  };

  private viewportStr = '1920x1080';
  private browserStr = 'Chrome';
  private environmentStr = 'ci';

  private rebuildVariant(): void {
    this.data = {
      ...this.data,
      variant: Variant.fromStrings(
        this.viewportStr,
        this.browserStr,
        this.environmentStr,
      ),
    };
  }

  static create(): ScreenshotBuilder {
    return new ScreenshotBuilder();
  }

  withId(id: string): this {
    this.data = { ...this.data, id };
    return this;
  }

  withType(type: ScreenshotType): this {
    this.data = { ...this.data, type };
    return this;
  }

  asBaseline(): this {
    return this.withType(ScreenshotType.BASELINE);
  }

  asCurrent(): this {
    return this.withType(ScreenshotType.CURRENT);
  }

  withVisualTestId(visualTestId: string): this {
    this.data = { ...this.data, visualTestId };
    return this;
  }

  withImageHash(hash: string): this {
    this.data = { ...this.data, imageHash: hash };
    return this;
  }

  withImageUrl(url: string): this {
    this.data = { ...this.data, imageUrl: url };
    return this;
  }

  withViewport(viewport: string): this {
    this.viewportStr = viewport;
    this.rebuildVariant();
    return this;
  }

  withBrowser(browser: string): this {
    this.browserStr = browser;
    this.rebuildVariant();
    return this;
  }

  withEnvironment(environment: string): this {
    this.environmentStr = environment;
    this.rebuildVariant();
    return this;
  }

  withPixelDiffThreshold(threshold: number): this {
    this.data = { ...this.data, pixelDiffThreshold: threshold };
    return this;
  }

  build(): ScreenshotEntity {
    return new ScreenshotEntity({ ...this.data });
  }
}

export class FileBuilder {
  static createMockFile(
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File {
    const buffer = Buffer.from('fake-image-content');

    const mockStream = new Readable({
      read() {
        this.push(null);
      },
    });

    return {
      fieldname: 'image',
      originalname: 'screenshot.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: buffer.length,
      stream: mockStream,
      buffer,
      destination: '',
      filename: 'screenshot.png',
      path: '',
      ...overrides,
    };
  }
}
