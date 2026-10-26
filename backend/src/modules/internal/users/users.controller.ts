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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Roles } from '@common/http/roles.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { Scope } from '@common/http/api-key-scope.decorator';
import {
  requireActor,
  requireUserActor,
} from '@common/http/authenticated-principal';
import { UsersService } from '@internal/users/users.service';
import {
  CreateUserDto,
  CreatedUserDto,
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

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiOkResponse({ type: [UserDto] })
  async list(): Promise<UserDto[]> {
    const rows = await this.users.list();
    return plainToInstance(UserDto, rows, { excludeExtraneousValues: true });
  }

  @Scope('admin')
  @Post()
  @ApiOperation({ summary: 'Create a user with a one-time temporary password' })
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
    return plainToInstance(
      CreatedUserDto,
      { ...created, user: created.user },
      { excludeExtraneousValues: true },
    );
  }

  @Scope('admin')
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

  @Scope('admin')
  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reset a password to a one-time value and revoke all sessions (admin only)',
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
