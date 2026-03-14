import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { SafeUser } from '../users/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { SocialProfile } from './interfaces/social-profile.interface';

interface SocialCallbackResultExisting {
  type: 'existing';
  code: string;
}

interface SocialCallbackResultNew {
  type: 'new';
  tempToken: string;
}

export type SocialCallbackResult = SocialCallbackResultExisting | SocialCallbackResultNew;

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const ONE_TIME_CODE_TTL = 5 * 60 * 1000; // 5분

interface OneTimeCodeEntry {
  userId: number;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private oneTimeCodes = new Map<string, OneTimeCodeEntry>();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
    private dataSource: DataSource,
  ) {}

  async validateUser(email: string, pass: string): Promise<SafeUser> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('탈퇴한 계정입니다.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('정지된 계정입니다.');
    }

    const isMatch = await bcrypt.compare(pass, user.password || '');
    if (!isMatch) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async generateTokens(user: { id: number; nickname: string; role: string }) {
    const payload = { nickname: user.nickname, sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const refreshToken = this.refreshTokenRepo.create({
      token: hashedToken,
      userId: user.id,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshToken);

    return {
      access_token: accessToken,
      refresh_token: rawToken,
    };
  }

  async refreshTokens(refreshToken: string) {
    const hashedInput = createHash('sha256').update(refreshToken).digest('hex');

    return this.dataSource.transaction(async (manager) => {
      const tokenEntity = await manager.findOne(RefreshToken, {
        where: { token: hashedInput },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tokenEntity) {
        throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
      }

      if (tokenEntity.expiresAt < new Date()) {
        await manager.remove(tokenEntity);
        throw new UnauthorizedException('만료된 리프레시 토큰입니다.');
      }

      const user = await this.usersService.findByIdWithStatus(tokenEntity.userId);
      if (!user) {
        await manager.remove(tokenEntity);
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      if (user.status === UserStatus.DELETED) {
        await manager.remove(tokenEntity);
        throw new UnauthorizedException('탈퇴한 계정입니다.');
      }

      if (user.status === UserStatus.SUSPENDED) {
        await manager.remove(tokenEntity);
        throw new UnauthorizedException('정지된 계정입니다.');
      }

      // Rotation: 기존 토큰 삭제 후 새 토큰 쌍 발급
      await manager.remove(tokenEntity);

      const payload = { nickname: user.nickname, sub: user.id, role: user.role };
      const accessToken = this.jwtService.sign(payload);
      const rawToken = randomBytes(32).toString('hex');
      const hashedNewToken = createHash('sha256').update(rawToken).digest('hex');

      const newRefreshToken = manager.create(RefreshToken, {
        token: hashedNewToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      });
      await manager.save(newRefreshToken);

      return {
        access_token: accessToken,
        refresh_token: rawToken,
        user: {
          id: user.id,
          nickname: user.nickname,
          role: user.role,
        },
      };
    });
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const hashedToken = createHash('sha256').update(refreshToken).digest('hex');
    await this.refreshTokenRepo.delete({ token: hashedToken });
  }

  async revokeAllUserTokens(userId: number): Promise<void> {
    await this.refreshTokenRepo.delete({ userId });
  }

  @Cron('0 3 * * *') // 매일 새벽 3시
  async cleanExpiredTokens(): Promise<void> {
    await this.refreshTokenRepo
      .createQueryBuilder('rt')
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
    this.cleanExpiredCodes();
  }

  generateOneTimeCode(userId: number): string {
    const code = randomBytes(32).toString('hex');
    this.oneTimeCodes.set(code, {
      userId,
      expiresAt: Date.now() + ONE_TIME_CODE_TTL,
    });
    return code;
  }

  async exchangeOneTimeCode(code: string) {
    const entry = this.oneTimeCodes.get(code);
    if (!entry) {
      throw new UnauthorizedException('유효하지 않거나 만료된 코드입니다.');
    }

    // 일회용: 즉시 삭제
    this.oneTimeCodes.delete(code);

    if (entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('유효하지 않거나 만료된 코드입니다.');
    }

    const user = await this.usersService.findByIdWithStatus(entry.userId);
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('탈퇴한 계정입니다.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('정지된 계정입니다.');
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        nickname: user.nickname,
        role: user.role,
      },
    };
  }

  cleanExpiredCodes(): void {
    const now = Date.now();
    for (const [code, entry] of this.oneTimeCodes) {
      if (entry.expiresAt < now) {
        this.oneTimeCodes.delete(code);
      }
    }
  }

  async handleSocialCallback(profile: SocialProfile): Promise<SocialCallbackResult> {
    const existingUser = await this.usersService.findByProvider(
      profile.provider,
      profile.providerId,
    );

    if (existingUser) {
      if (existingUser.status === UserStatus.SUSPENDED) {
        throw new UnauthorizedException('정지된 계정입니다.');
      }

      if (existingUser.status === UserStatus.DELETED) {
        throw new UnauthorizedException('탈퇴한 계정입니다.');
      }

      const code = this.generateOneTimeCode(existingUser.id);
      return {
        type: 'existing',
        code,
      };
    }

    // 신규 유저: tempToken 생성 (소셜 프로필 JWT, 5분 만료)
    const tempToken = this.jwtService.sign(
      {
        provider: profile.provider,
        providerId: profile.providerId,
        email: profile.email,
        nickname: profile.nickname,
        profileImage: profile.profileImage,
        type: 'social_signup',
      },
      { expiresIn: '5m' },
    );

    return { type: 'new', tempToken };
  }

  async completeSocialSignup(tempToken: string, nickname: string) {
    let payload: {
      provider: string;
      providerId: string;
      email: string | null;
      nickname: string | null;
      profileImage: string | null;
      type: string;
    };

    try {
      payload = this.jwtService.verify(tempToken);
    } catch {
      throw new BadRequestException('유효하지 않거나 만료된 임시 토큰입니다.');
    }

    if (payload.type !== 'social_signup') {
      throw new BadRequestException('유효하지 않은 토큰 타입입니다.');
    }

    // 동일 provider+providerId로 이미 가입된 유저 존재 시 ConflictException
    const existingByProvider = await this.usersService.findByProvider(
      payload.provider as SocialProfile['provider'],
      payload.providerId,
    );
    if (existingByProvider) {
      throw new ConflictException('이미 가입된 소셜 계정입니다.');
    }

    const user = await this.usersService.createSocialUser({
      nickname,
      provider: payload.provider as SocialProfile['provider'],
      providerId: payload.providerId,
      email: payload.email,
      profileImage: payload.profileImage,
    });

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    // USER 역할은 소셜 로그인만 허용, ADMIN만 이메일 로그인 가능
    if (user.role === UserRole.USER) {
      throw new UnauthorizedException('소셜 로그인을 이용해주세요.');
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        role: user.role,
      },
    };
  }
}
