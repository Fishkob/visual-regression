import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadDocumentDto } from '@public/visualTest/intake/presentation/dto/upload.dto';

describe('UploadDocumentDto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const variant = {
    viewport: '1920x1080',
    browser: 'chrome',
    environment: 'staging',
  };

  async function parse(fields: Record<string, unknown>) {
    const dto = plainToInstance(UploadDocumentDto, { ...variant, ...fields });
    const errors = await validate(dto, { whitelist: true });
    return { dto, errors };
  }

  describe('ciUrl', () => {
    it('accepts an https CI url', async () => {
      const { dto, errors } = await parse({
        ciUrl: 'https://github.com/org/repo/actions/runs/1',
      });

      expect(errors).toEqual([]);
      expect(dto.ciUrl).toBe('https://github.com/org/repo/actions/runs/1');
    });

    it('accepts a self-hosted http url without a TLD', async () => {
      const { errors } = await parse({ ciUrl: 'http://localhost:3001/ci' });

      expect(errors).toEqual([]);
    });

    it('accepts an omitted ciUrl', async () => {
      const { dto, errors } = await parse({});

      expect(errors).toEqual([]);
      expect(dto.ciUrl).toBeUndefined();
    });

    it.each([
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      "data:text/html,<script>alert('x')</script>",
      'ftp://ci.example.com/runs/1',
      'file:///etc/passwd',
      'github.com/org/repo/actions/runs/1',
    ])('rejects %s', async (ciUrl) => {
      const { errors } = await parse({ ciUrl });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('ciUrl');
    });
  });
});
