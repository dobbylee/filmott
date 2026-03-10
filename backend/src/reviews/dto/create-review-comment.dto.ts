import { IsString, MinLength } from 'class-validator';

export class CreateReviewCommentDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
