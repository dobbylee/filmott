import {
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsArray,
  IsOptional,
  ArrayMaxSize,
} from 'class-validator';

export class CompleteSocialSignupDto {
  @IsNotEmpty({ message: '닉네임을 입력해주세요.' })
  @IsString({ message: '닉네임은 문자열이어야 합니다.' })
  @MinLength(2, { message: '닉네임은 2자 이상이어야 합니다.' })
  @MaxLength(16, { message: '닉네임은 16자 이내여야 합니다.' })
  @Matches(/^[가-힣a-zA-Z0-9_]+$/, {
    message: '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.',
  })
  nickname!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  subscribedOtts?: string[];
}
