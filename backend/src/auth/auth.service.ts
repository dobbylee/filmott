import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { SafeUser } from '../users/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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

    const refreshTokenValue = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const refreshToken = this.refreshTokenRepo.create({
      token: refreshTokenValue,
      userId: user.id,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshTokenValue,
    };
  }

  async refreshTokens(refreshToken: string) {
    const tokenEntity = await this.refreshTokenRepo.findOne({
      where: { token: refreshToken },
    });

    if (!tokenEntity) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
    }

    if (tokenEntity.expiresAt < new Date()) {
      await this.refreshTokenRepo.remove(tokenEntity);
      throw new UnauthorizedException('만료된 리프레시 토큰입니다.');
    }

    const user = await this.usersService.findByIdWithStatus(tokenEntity.userId);
    if (!user) {
      await this.refreshTokenRepo.remove(tokenEntity);
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === UserStatus.DELETED) {
      await this.refreshTokenRepo.remove(tokenEntity);
      throw new UnauthorizedException('탈퇴한 계정입니다.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.refreshTokenRepo.remove(tokenEntity);
      throw new UnauthorizedException('정지된 계정입니다.');
    }

    // Rotation: 기존 토큰 삭제 후 새 토큰 쌍 발급
    await this.refreshTokenRepo.remove(tokenEntity);

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

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.refreshTokenRepo.delete({ token: refreshToken });
  }

  async revokeAllUserTokens(userId: number): Promise<void> {
    await this.refreshTokenRepo.delete({ userId });
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
