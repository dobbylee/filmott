import {
  IsOptional,
  IsInt,
  IsString,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsDateString()
  watchedAt?: string;
}
