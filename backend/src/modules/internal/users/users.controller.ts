import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import type { Request } from 'express';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import {
  requireActor,
  requireUserActor,
} from '@common/http/authenticated-principal';
import { PublicEndpoint } from '@common/http/public.decorator';
import { Roles } from '@common/http/roles.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';
import { UsersService } from '@internal/users/users.service';
import {
  CreateUserDto,
  CreatedUserDto,
  InvitePreviewDto,
  InviteRevealDto,
  ResetPasswordResultDto,
  UpdateUserDto,
  UserDto,
} from '@internal/users/dto/user.dto';

@ApiTags('Users')
@Controller('users')
@Roles('ADMIN')
@SessionOnly()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiOkResponse({ type: [UserDto] })
  async list(): Promise<UserDto[]> {
    const rows = await this.users.list();
    return plainToInstance(UserDto, rows, { excludeExtraneousValues: true });
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a user with a one-time invite link that reveals its temporary password',
  })
  @ApiCreatedResponse({ type: CreatedUserDto })
  async create(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreatedUserDto> {
    const created = await this.users.create(
      requireUserActor(req),
      dto.username,
      dto.role,
    );
    return plainToInstance(CreatedUserDto, created, {
      excludeExtraneousValues: true,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a role or deactivate a user' })
  @ApiOkResponse({ type: UserDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserDto> {
    const updated = await this.users.update(requireUserActor(req), id, dto);
    return plainToInstance(UserDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reset a password to a one-time value, revoke all sessions and issue an invite link (admin only)',
  })
  @ApiOkResponse({ type: ResetPasswordResultDto })
  async resetPassword(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResetPasswordResultDto> {
    const result = await this.users.resetPassword(
      { username: requireActor(req) },
      id,
    );
    return plainToInstance(ResetPasswordResultDto, result, {
      excludeExtraneousValues: true,
    });
  }
}

// The unauthenticated half of the invite flow: the person holding the link has
// no account yet (their password is what the link carries), so these two routes
// are the only way in. Read and reveal are separate on purpose — chat clients
// and mail scanners fetch every URL they see, and a reveal that ran on GET would
// be used up before the human clicked it.
@ApiTags('User invites')
@Controller('public/user-invites')
export class PublicUserInviteController {
  constructor(private readonly users: UsersService) {}

  @PublicEndpoint()
  @Get(':token')
  @ApiOperation({
    summary: 'Read who an invite link belongs to, without using it up',
  })
  @ApiOkResponse({ type: InvitePreviewDto })
  @ApiNotFoundResponse({ description: 'No invite carries this token' })
  async preview(@Param('token') token: string): Promise<InvitePreviewDto> {
    const preview = await this.users.peekInvite(token);
    return plainToInstance(InvitePreviewDto, preview, {
      excludeExtraneousValues: true,
    });
  }

  @PublicEndpoint()
  @Post(':token/reveal')
  @HttpCode(200)
  @RateLimit('login')
  @ApiOperation({
    summary: 'Reveal the temporary password once, then kill the link',
  })
  @ApiOkResponse({ type: InviteRevealDto })
  @ApiNotFoundResponse({ description: 'No invite carries this token' })
  @ApiGoneResponse({ description: 'The link was already used or has expired' })
  async reveal(
    @Param('token') token: string,
    @Req() req: Request,
  ): Promise<InviteRevealDto> {
    const revealed = await this.users.claimInvite(token, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return plainToInstance(InviteRevealDto, revealed, {
      excludeExtraneousValues: true,
    });
  }
}
