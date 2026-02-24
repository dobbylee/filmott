import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Username must be at least 2 characters long.' })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Current password must be at least 6 characters long.' })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters long.' })
  newPassword?: string;
}
