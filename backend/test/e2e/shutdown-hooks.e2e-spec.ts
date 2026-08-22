import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { MinioStorageService } from '@internal/storage/services/minio-storage.service';
import { TestApp } from './_support/utils/test-app';
describe('Graceful Shutdown Hooks (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaConnection;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection);
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should trigger all shutdown hooks when the app closes', async () => {
    const prismaSpy = jest
      .spyOn(prisma.client, '$disconnect')
      .mockResolvedValue();
    const minioSpy = jest.spyOn(
      MinioStorageService.prototype,
      'onModuleDestroy',
    );

    await TestApp.close();

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(prismaSpy).toHaveBeenCalledTimes(1);
    expect(minioSpy).toHaveBeenCalledTimes(1);
  });
});
