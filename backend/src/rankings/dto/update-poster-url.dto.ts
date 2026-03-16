import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdatePosterUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  posterUrl!: string;
}
