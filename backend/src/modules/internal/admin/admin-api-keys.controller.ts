import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { PublicEndpoint } from '@common/http/public.decorator';
import { AdminAuthGuard } from '@internal/dlq/admin-auth.guard';
import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';
import { ApiKeyService } from '@internal/auth/api-key.service';
import {
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from '@internal/auth/dto/create-api-key.dto';

const ADMIN_KEY_ACTOR = 'admin-api-key';

// Deliberately outside the product API surface (spec: "narrower than the
// global guard, not part of the product API surface"): only AdminAuthGuard
// applies, so a key can be provisioned before any product credential exists.
@ApiTags('Admin')
@PublicEndpoint()
@Controller('admin/api-keys')
@RateLimit('admin')
@UseGuards(AdminAuthGuard)
export class AdminApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  async create(@Body() dto: CreateApiKeyDto): Promise<CreatedApiKeyDto> {
    // Provisioning has no signed-in human; the x-admin-key is the principal,
    // so the trail names that credential instead of inventing a user.
    return this.apiKeyService.createKey(ADMIN_KEY_ACTOR, {
      name: dto.name,
      expiresInDays: dto.expiresInDays ?? null,
      // The DTO is the operator's contract: a bootstrap key that will seed or
      // upload for CI may need more than the default `upload` scope, so the
      // request's scopes and project allowlist must reach the service.
      ...(dto.scopes ? { scopes: dto.scopes } : {}),
      ...(dto.projectNames ? { projectNames: dto.projectNames } : {}),
    });
  }
}
