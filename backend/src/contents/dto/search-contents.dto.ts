import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator';

export class SearchContentsDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsIn(['movie', 'tv', 'person'])
  type?: 'movie' | 'tv' | 'person';

  @IsOptional()
  @IsNumberString()
  page?: string;
}
