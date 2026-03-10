import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator';

export class SearchContentsDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsIn(['movie', 'tv'])
  type?: 'movie' | 'tv';

  @IsOptional()
  @IsNumberString()
  page?: string;
}
