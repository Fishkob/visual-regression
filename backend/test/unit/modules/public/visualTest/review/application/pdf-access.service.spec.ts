import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PdfAccessService } from '@public/visualTest/review/application/pdf-access.service';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

const sources = {
  baselineUrl: 'http://rustfs/baseline.pdf',
  candidateUrl: 'http://rustfs/candidate.pdf',
  diffPdfUrl: 'http://rustfs/diff.pdf',
};

describe('PdfAccessService', () => {
  let service: PdfAccessService;
  let reviewRead: Mocked<TestReadRepository>;
  let pdfRenderCache: Mocked<IPdfRenderCache>;
  let storage: Mocked<IStorageProvider>;

  beforeEach(async () => {
    reviewRead = createMock<TestReadRepository>();
    reviewRead.findPdfDownloadSources.mockResolvedValue(sources);
    reviewRead.assertPdfBelongsToTest.mockResolvedValue(undefined);
    pdfRenderCache = createMock<IPdfRenderCache>();
    storage = createMock<IStorageProvider>();
    storage.get.mockResolvedValue(Buffer.from('pdf-content'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfAccessService,
        { provide: TestReadRepository, useValue: reviewRead },
        { provide: PDF_RENDER_CACHE, useValue: pdfRenderCache },
        { provide: STORAGE_PROVIDER, useValue: storage },
      ],
    }).compile();

    service = module.get(PdfAccessService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads the baseline PDF', async () => {
    const result = await service.download('proj', 'test', 'baseline', {
      viewport: '1920x1080',
    });

    expect(result).toEqual({
      buffer: Buffer.from('pdf-content'),
      filename: 'test-baseline.pdf',
      contentType: 'application/pdf',
    });
    expect(reviewRead.findPdfDownloadSources).toHaveBeenCalledWith(
      'proj',
      'test',
      { viewport: '1920x1080' },
      undefined,
    );
    expect(reviewRead.assertPdfBelongsToTest).toHaveBeenCalledWith(
      'proj',
      'test',
      'http://rustfs/baseline.pdf',
      undefined,
    );
    expect(storage.get).toHaveBeenCalledWith('http://rustfs/baseline.pdf');
  });

  it('rejects a baseline url that does not belong to the test', async () => {
    reviewRead.assertPdfBelongsToTest.mockRejectedValue(
      new DomainError('PDF does not belong to this test', 'FORBIDDEN'),
    );

    await expect(
      service.download('proj', 'test', 'baseline', {
        viewport: '1920x1080',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('forwards variant filters to the read repository', async () => {
    await service.download('proj', 'test', 'baseline', {
      viewport: '1920x1080',
      browser: 'chrome',
      environment: 'staging',
    });

    expect(reviewRead.findPdfDownloadSources).toHaveBeenCalledWith(
      'proj',
      'test',
      {
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'staging',
      },
      undefined,
    );
  });

  it('downloads the candidate PDF', async () => {
    const result = await service.download('proj', 'test', 'candidate', {
      viewport: '1920x1080',
    });

    expect(result.filename).toBe('test-candidate.pdf');
    expect(storage.get).toHaveBeenCalledWith('http://rustfs/candidate.pdf');
  });

  it('downloads the diff PDF', async () => {
    const result = await service.download('proj', 'test', 'diff', {
      viewport: '1920x1080',
    });

    expect(result.filename).toBe('test-diff.pdf');
    expect(storage.get).toHaveBeenCalledWith('http://rustfs/diff.pdf');
  });

  it('throws BadRequest for invalid type', async () => {
    await expect(
      service.download('proj', 'test', 'invalid' as any, {
        viewport: '1920x1080',
      }),
    ).rejects.toEqual(
      new DomainError('Invalid download type: "invalid"', 'BAD_REQUEST'),
    );
  });

  it('throws BadRequest when no variant filter is provided', async () => {
    await expect(
      service.download('proj', 'test', 'baseline'),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Variant filters (viewport/browser/environment) are required',
    });
    expect(reviewRead.findPdfDownloadSources).not.toHaveBeenCalled();
  });

  it('rejects an empty-string variant filter instead of picking an arbitrary variant', async () => {
    await expect(
      service.download('proj', 'test', 'baseline', { viewport: '' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Variant filter "viewport" must be a non-empty string',
    });
    expect(reviewRead.findPdfDownloadSources).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only variant filter', async () => {
    await expect(
      service.download('proj', 'test', 'baseline', { viewport: '   ' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(reviewRead.findPdfDownloadSources).not.toHaveBeenCalled();
  });

  it('throws NotFound when baseline PDF URL is missing', async () => {
    reviewRead.findPdfDownloadSources.mockResolvedValue({
      baselineUrl: null,
      candidateUrl: null,
      diffPdfUrl: null,
    });

    await expect(
      service.download('proj', 'test', 'baseline', { viewport: '1920x1080' }),
    ).rejects.toThrow('PDF not found');
  });

  it('throws NotFound when the test does not exist', async () => {
    reviewRead.findPdfDownloadSources.mockResolvedValue(null);

    await expect(
      service.download('proj', 'test', 'baseline', { viewport: '1920x1080' }),
    ).rejects.toThrow('PDF not found');
  });

  it('throws Forbidden when the PDF url is not a storage url', async () => {
    storage.get.mockRejectedValue(
      new DomainError('PDF not found in storage', 'NOT_FOUND'),
    );

    await expect(
      service.download('proj', 'test', 'baseline', { viewport: '1920x1080' }),
    ).rejects.toThrow('PDF not found in storage');
  });

  describe('renderPdfPage', () => {
    it('enforces ownership of the caller-supplied url before rendering', async () => {
      pdfRenderCache.renderPage.mockResolvedValue({
        imageUrl: 'http://rustfs/render.png',
        pageCount: 3,
      });

      const result = await service.renderPdfPage(
        'proj',
        'test',
        'http://rustfs/candidate.pdf',
        2,
      );

      expect(reviewRead.assertPdfBelongsToTest).toHaveBeenCalledWith(
        'proj',
        'test',
        'http://rustfs/candidate.pdf',
        undefined,
      );
      expect(pdfRenderCache.renderPage).toHaveBeenCalledWith(
        'http://rustfs/candidate.pdf',
        2,
      );
      expect(result).toEqual({
        imageUrl: 'http://rustfs/render.png',
        pageCount: 3,
      });
    });

    it('rejects a url that does not belong to the test', async () => {
      reviewRead.assertPdfBelongsToTest.mockRejectedValue(
        new DomainError('PDF does not belong to this test', 'FORBIDDEN'),
      );

      await expect(
        service.renderPdfPage('proj', 'test', 'http://rustfs/foreign.pdf', 1),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(pdfRenderCache.renderPage).not.toHaveBeenCalled();
    });
  });
});
