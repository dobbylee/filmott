import { IsNumber, IsNotEmpty, IsIn, IsBoolean } from 'class-validator';

export class ToggleAdultDto {
  @IsNumber()
  @IsNotEmpty()
  tmdbId!: number;

  @IsIn(['movie', 'tv'])
  contentType!: 'movie' | 'tv';

  @IsBoolean()
  adult!: boolean;
}
