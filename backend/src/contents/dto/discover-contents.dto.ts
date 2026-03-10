import { IsOptional, IsIn, IsNumberString, IsString } from 'class-validator';

export class DiscoverContentsDto {
  @IsOptional()
  @IsIn(['movie', 'tv'])
  type?: 'movie' | 'tv';

  @IsOptional()
  @IsString()
  genres?: string;

  @IsOptional()
  @IsString()
  providers?: string;

  @IsOptional()
  @IsNumberString()
  year?: string;

  @IsOptional()
  @IsIn(['popularity.desc', 'vote_average.desc', 'primary_release_date.desc', 'revenue.desc'])
  sort?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;
}
