import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nickname must be at least 2 characters long.' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, {
    message: 'Current password must be at least 8 characters long.',
  })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long.' })
  newPassword?: string;
}
