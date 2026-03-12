import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
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
  @MaxLength(500)
  comment?: string;
}
