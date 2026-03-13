import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: '리프레시 토큰을 입력해주세요.' })
  @IsString()
  refresh_token!: string;
}
