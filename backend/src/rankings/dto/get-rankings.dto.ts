import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class GetRankingsDto {
  @IsString()
  source!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
