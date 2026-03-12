import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: '닉네임은 2자 이상이어야 합니다.' })
  @MaxLength(16, { message: '닉네임은 16자 이내여야 합니다.' })
  @Matches(/^[가-힣a-zA-Z0-9_]+$/, { message: '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '현재 비밀번호는 8자 이상이어야 합니다.' })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '새 비밀번호는 8자 이상이어야 합니다.' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,
    { message: '비밀번호는 8자 이상, 영문/숫자/특수문자를 모두 포함해야 합니다.' },
  )
  newPassword?: string;
}
