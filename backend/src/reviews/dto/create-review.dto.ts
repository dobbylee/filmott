import {
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  contentId!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  hasSpoiler?: boolean;
}
