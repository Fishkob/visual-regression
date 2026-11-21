import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// The inbox's branch dropdown follows the team lens: filtering the queue to one
// team must not offer the branches of another. A DTO (not a bare `@Query` param)
// so the parameter is optional in the published contract.
export class InboxBranchesQueryDto {
  @ApiPropertyOptional({
    description: 'Team id: only the branches of the projects this team owns',
  })
  @IsOptional()
  @IsString()
  teamId?: string;
}
