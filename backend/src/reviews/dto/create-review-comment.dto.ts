import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateReviewCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;
}
