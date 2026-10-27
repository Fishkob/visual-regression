import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TestCommandsController } from '@public/visualTest/review/presentation/controllers/test-commands.controller';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import {
  UpdateThresholdDto,
  UpdateThresholdQueryDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';
import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import { createMock } from '@test/utils/create-mock';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type AppRole } from '@common/http/roles.decorator';
describe('TestCommandsController', () => {
  let controller: TestCommandsController;
  let testCommandService: Mocked<TestCommandService>;

  beforeEach(async () => {
    testCommandService = createMock<TestCommandService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestCommandsController],
      providers: [
        { provide: TestCommandService, useValue: testCommandService },
      ],
    }).compile();

    controller = module.get(TestCommandsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an ADMIN for the threshold update, preview included', () => {
    const roles = new Reflector().getAllAndOverride<AppRole[]>(ROLES_KEY, [
      TestCommandsController.prototype.updateThreshold,
    ]);

    expect(roles).toEqual(['ADMIN']);
  });

  describe('updateThreshold', () => {
    it('calls testCommandService.updateThreshold with params, body, and filters', async () => {
      const body: UpdateThresholdDto = { threshold: 50 };
      const query = new UpdateThresholdQueryDto();
      query.viewport = '1920x1080';
      query.browser = 'Chrome';
      query.environment = 'ci';

      const expected = {
        status: 'updated',
        test: 'login-form',
        threshold: 50,
      };
      testCommandService.updateThreshold.mockResolvedValue(expected as any);

      const result = await controller.updateThreshold(
        'checkout-ui',
        'login-form',
        body,
        query,
        { auth: { username: 'jane', userId: 'user-1' } } as never,
      );

      expect(result).toEqual(expected);
      expect(testCommandService.updateThreshold).toHaveBeenCalledWith(
        'login-form',
        'checkout-ui',
        body.threshold,
        'jane',
        query,
        false,
        undefined,
      );
    });

    it('forwards the preview flag to the service', async () => {
      const body = { threshold: 50 };
      const query = new UpdateThresholdQueryDto();
      query.viewport = '1920x1080';
      query.browser = 'Chrome';
      query.environment = 'ci';
      query.preview = 'true';

      testCommandService.updateThreshold.mockResolvedValue({
        status: 'updated',
        test: 'login-form',
        threshold: 50,
        autoAcceptedCount: 2,
      } as any);

      await controller.updateThreshold(
        'checkout-ui',
        'login-form',
        body,
        query,
        { auth: { username: 'jane', userId: 'user-1' } } as never,
      );

      expect(testCommandService.updateThreshold).toHaveBeenCalledWith(
        'login-form',
        'checkout-ui',
        body.threshold,
        'jane',
        query,
        true,
        undefined,
      );
    });
  });

  describe('deleteVisualTest', () => {
    it('calls testCommandService.deleteTest with params and filters', async () => {
      testCommandService.deleteTest.mockResolvedValue({
        success: true,
        scope: 'test',
      } as any);

      const filterDto = new VariantFilterDto();
      filterDto.viewport = '1920x1080';

      const result = await controller.deleteVisualTest(
        'checkout-ui',
        'login-form',
        filterDto,
        { auth: { username: 'jane', userId: 'user-1' } } as never,
      );

      expect(result).toEqual({ success: true, scope: 'test' });
      expect(testCommandService.deleteTest).toHaveBeenCalledWith(
        'checkout-ui',
        'login-form',
        'jane',
        undefined,
        filterDto,
      );
    });
  });
});
