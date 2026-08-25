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
import { ApiKeyService } from '@internal/auth/api-key.service';
import {
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from '@internal/auth/dto/create-api-key.dto';

// Deliberately outside the product API surface (spec: "narrower than the
// global guard, not part of the product API surface"): only AdminAuthGuard
// applies, so a key can be provisioned before any product credential exists.
@ApiTags('Admin')
@PublicEndpoint()
@Controller('admin/api-keys')
@UseGuards(AdminAuthGuard)
export class AdminApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  async create(@Body() dto: CreateApiKeyDto): Promise<CreatedApiKeyDto> {
    return this.apiKeyService.createKey(dto.name);
  }
}
