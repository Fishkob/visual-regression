import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';
import { PaginatedResponseDto } from '@common/dto/paginated-response.dto';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { PendingReviewDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';

@ApiTags('Review')
@Controller('review')
export class ReviewInboxController {
  constructor(private readonly inbox: ReviewInboxService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List pending reviews across all projects' })
  @ApiOkResponse({ type: PaginatedResponseDto(PendingReviewDto) })
  async getPending(@Query() pagination: PaginationDto) {
    return this.inbox.getPending(pagination);
  }
}
