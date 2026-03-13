import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/enums/user-status.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; nickname: string; role?: string }) {
    const user = await this.usersService.findByIdWithStatus(payload.sub);

    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      id: user.id,
      nickname: user.nickname,
      role: user.role,
    };
  }
}
