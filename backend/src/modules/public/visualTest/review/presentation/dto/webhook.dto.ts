import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  WEBHOOK_SUBSCRIPTION_EVENTS,
  type WebhookSubscriptionEvent,
} from '@internal/webhooks/webhook.types';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://hooks.slack.com/services/...' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @ApiProperty({ enum: WEBHOOK_SUBSCRIPTION_EVENTS, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => String)
  @IsIn([...WEBHOOK_SUBSCRIPTION_EVENTS], { each: true })
  events!: WebhookSubscriptionEvent[];

  @ApiPropertyOptional({ enum: ['json', 'slack'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'slack'])
  format?: 'json' | 'slack';

  @ApiPropertyOptional({
    description:
      'Custom signing secret (min 16 chars). Generated and returned once when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  secret?: string;
}

export class UpdateWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ enum: WEBHOOK_SUBSCRIPTION_EVENTS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => String)
  @IsIn([...WEBHOOK_SUBSCRIPTION_EVENTS], { each: true })
  events?: WebhookSubscriptionEvent[];

  @ApiPropertyOptional({ enum: ['json', 'slack'] })
  @IsOptional()
  @IsIn(['json', 'slack'])
  format?: 'json' | 'slack';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Rotate the signing secret (min 16 chars).',
  })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  secret?: string;
}

export class WebhookEndpointDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  url!: string;

  @ApiProperty({ type: String, isArray: true })
  @Expose()
  events!: WebhookSubscriptionEvent[];

  @ApiProperty({ enum: ['json', 'slack'] })
  @Expose()
  format!: string;

  @ApiProperty()
  @Expose()
  active!: boolean;

  @ApiProperty({
    description:
      'Last four characters of the secret; the full secret is only returned on create/rotate.',
  })
  @Expose()
  secretPreview!: string;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty()
  @Expose()
  updatedAt!: Date;
}

export class CreatedWebhookEndpointDto extends WebhookEndpointDto {
  @ApiProperty({
    description: 'Full signing secret — shown exactly once.',
  })
  @Expose()
  secret!: string;
}

export class WebhookDeliveryDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  event!: string;

  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED'] })
  @Expose()
  status!: string;

  @ApiProperty()
  @Expose()
  attempts!: number;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  responseStatus?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  lastError?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  nextAttemptAt?: Date | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  deliveredAt?: Date | null;
}

export class WebhookTestResultDto {
  @ApiProperty()
  @Expose()
  queued!: boolean;
}

export class WebhookReplayResultDto {
  @ApiProperty()
  @Expose()
  queued!: boolean;
}
