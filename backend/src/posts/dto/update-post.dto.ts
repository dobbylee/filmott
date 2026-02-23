import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Title must be at least 2 characters long.' })
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Content must be at least 10 characters long.' })
  content?: string;
}
