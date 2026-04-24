import {
  IsString,
  IsArray,
  IsOptional,
  IsIn,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatHistoryRecommendationDto {
  @IsInt()
  tmdbId!: number;

  @IsString()
  @IsIn(['movie', 'tv'])
  contentType!: 'movie' | 'tv';

  @IsString()
  @MaxLength(120)
  title!: string;
}

export class ChatHistoryMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryRecommendationDto)
  @ArrayMaxSize(5)
  recommendations?: ChatHistoryRecommendationDto[];
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  @ArrayMaxSize(20)
  history?: ChatHistoryMessageDto[];
}
