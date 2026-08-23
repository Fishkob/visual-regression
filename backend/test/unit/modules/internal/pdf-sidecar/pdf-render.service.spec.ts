import { Test, TestingModule } from '@nestjs/testing';
import { PdfRenderService } from '@internal/pdf-sidecar/pdf-render.service';
import { PdfRenderCacheStore } from '@internal/pdf-sidecar/pdf-render-cache-store';
import {
  PDF_PAGE_RENDERER,
  IPdfPageRenderer,
} from '@common/domain/pdf-sidecar.interface';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMockLogger } from '@test/utils/mocks';
import { NotFoundException } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

describe('PdfRenderService', () => {
  let service: PdfRenderService;
  let renderCache: jest.Mocked<PdfRenderCacheStore>;
  let renderer: jest.Mocked<IPdfPageRenderer>;
  let storage: jest.Mocked<IStorageProvider>;
  let logger: ReturnType<typeof createMockLogger>;

  const pdfUrl = 'http://storage/project/test/document.pdf';
  const objectName = 'project/test/document.pdf';
  const baseName = 'project/test/document';
  const cachePath = 'pdf-render/project/test/document/5/page-1.png';
  const cacheUrl = `http://cdn/${cachePath}`;

  beforeEach(async () => {
    renderCache = createMock<PdfRenderCacheStore>();
    renderer = createMock<IPdfPageRenderer>();
    storage = createMock<IStorageProvider>();
    storage.get.mockResolvedValue(Buffer.from('pdf-content'));
    storage.fromUrl.mockReturnValue(objectName);
    storage.toPublicUrl.mockReturnValue(cacheUrl);
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfRenderService,
        { provide: PdfRenderCacheStore, useValue: renderCache },
        { provide: PDF_PAGE_RENDERER, useValue: renderer },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(PdfRenderService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('renderPage', () => {
    it('throws DomainError when PDF URL is invalid', async () => {
      storage.fromUrl.mockReturnValue(null);

      await expect(service.renderPage('invalid-url', 1)).rejects.toThrow(
        DomainError,
      );
    });

    it('returns cached image when page count is cached and image exists', async () => {
      renderCache.get.mockResolvedValue(5);
      storage.exists.mockResolvedValue(true);

      const result = await service.renderPage(pdfUrl, 1);

      expect(renderCache.get).toHaveBeenCalledWith(baseName);
      expect(storage.exists).toHaveBeenCalledWith(cacheUrl);
      expect(result).toEqual({ imageUrl: cacheUrl, pageCount: 5 });
      expect(storage.get).not.toHaveBeenCalled();
      expect(renderer.renderPdfPage).not.toHaveBeenCalled();
    });

    it('re-renders when cache page count exists but image was evicted', async () => {
      renderCache.get.mockResolvedValue(5);
      storage.exists.mockResolvedValue(false);
      renderer.renderPdfPage.mockResolvedValue({
        imageBuffer: Buffer.from('rendered-page'),
        pageCount: 5,
      });

      const result = await service.renderPage(pdfUrl, 1);

      expect(storage.get).toHaveBeenCalledWith(pdfUrl);
      expect(renderer.renderPdfPage).toHaveBeenCalled();
      expect(storage.putObject).toHaveBeenCalled();
      expect(result).toEqual({ imageUrl: cacheUrl, pageCount: 5 });
    });

    it('renders PDF when page count not cached', async () => {
      renderCache.get.mockResolvedValue(undefined);
      renderer.renderPdfPage.mockResolvedValue({
        imageBuffer: Buffer.from('rendered-page'),
        pageCount: 3,
      });

      const result = await service.renderPage(pdfUrl, 1);

      expect(renderCache.get).toHaveBeenCalledWith(baseName);
      expect(storage.get).toHaveBeenCalledWith(pdfUrl);
      expect(renderer.renderPdfPage).toHaveBeenCalled();
      expect(storage.putObject).toHaveBeenCalled();
      expect(renderCache.set).toHaveBeenCalledWith(baseName, 3);
      expect(result).toEqual({ imageUrl: cacheUrl, pageCount: 3 });
    });

    it('throws NotFoundException when PDF file cannot be read from storage', async () => {
      renderCache.get.mockResolvedValue(undefined);
      storage.get.mockRejectedValue(
        new NotFoundException('PDF file not found'),
      );

      await expect(service.renderPage(pdfUrl, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('clearCache', () => {
    it('evicts page count cache for the PDF and reports success', async () => {
      renderCache.evict.mockResolvedValue(true);

      await expect(service.clearCache(pdfUrl)).resolves.toBe(true);

      expect(renderCache.evict).toHaveBeenCalledWith(baseName);
    });

    it('returns false when PDF URL is invalid', async () => {
      storage.fromUrl.mockReturnValue(null);

      await expect(service.clearCache('invalid-url')).resolves.toBe(false);

      expect(renderCache.evict).not.toHaveBeenCalled();
    });

    it('logs warning and returns false when eviction reports failure', async () => {
      renderCache.evict.mockResolvedValue(false);

      await expect(service.clearCache(pdfUrl)).resolves.toBe(false);

      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
