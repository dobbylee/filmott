import { IsInt, IsIn, IsOptional, IsDateString } from 'class-validator';

export class AddToWatchlistDto {
  @IsInt()
  tmdbId!: number;

  @IsIn(['movie', 'tv'])
  contentType!: 'movie' | 'tv';

  @IsIn(['want_to_watch', 'watched'])
  status!: 'want_to_watch' | 'watched';

  @IsOptional()
  @IsDateString()
  watchedAt?: string;
}
