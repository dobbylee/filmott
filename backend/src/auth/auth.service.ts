import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { SafeUser } from '../users/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RefreshToken } from './entities/refresh-token.entity';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class AuthService {
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
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
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
