import { IsOptional, IsIn, IsDateString } from 'class-validator';

export class UpdateWatchlistDto {
  @IsOptional()
  @IsIn(['want_to_watch', 'watched'])
  status?: 'want_to_watch' | 'watched';

  @IsOptional()
  @IsDateString()
  watchedAt?: string;
}
