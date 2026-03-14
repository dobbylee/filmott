import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserStatus } from '../enums/user-status.enum';

export class AdminGetUsersDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
