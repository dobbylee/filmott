import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '../enums/user-status.enum';

export class AdminUpdateStatusDto {
  @IsNotEmpty({ message: '상태를 입력해주세요.' })
  @IsEnum([UserStatus.ACTIVE, UserStatus.SUSPENDED], {
    message: 'ACTIVE 또는 SUSPENDED만 지정할 수 있습니다.',
  })
  status!: UserStatus.ACTIVE | UserStatus.SUSPENDED;
}
