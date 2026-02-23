import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsNotEmpty({ message: 'Title is required.' })
  @IsString()
  @MinLength(2, { message: 'Title must be at least 2 characters long.' })
  title!: string;

  @IsNotEmpty({ message: 'Content is required.' })
  @IsString()
  @MinLength(10, { message: 'Content must be at least 10 characters long.' })
  content!: string;
}
