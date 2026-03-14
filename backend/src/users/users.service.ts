import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User, SafeUser } from './user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { AuthProvider } from './enums/auth-provider.enum';
import { UserStatus } from './enums/user-status.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  /**
   * 닉네임으로 사용자 조회 (DELETED 제외)
   * ACTIVE + SUSPENDED 모두 포함 -- 닉네임 중복 체크 시 정지된 계정도 잡아야 함
   */
  async findOne(nickname: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { nickname, status: Not(UserStatus.DELETED) },
    });
  }

  /**
   * 이메일로 사용자 조회 (DELETED 제외)
   * ACTIVE + SUSPENDED 모두 포함 -- 탈퇴 유저의 이메일 재사용 허용
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email, status: Not(UserStatus.DELETED) },
    });
  }

  /**
   * provider + providerId로 사용자 조회 (DELETED 제외)
   */
  async findByProvider(provider: AuthProvider, providerId: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { provider, providerId, status: Not(UserStatus.DELETED) },
    });
  }

  async isNicknameAvailable(nickname: string): Promise<boolean> {
    const existing = await this.findOne(nickname);
    return !existing;
  }

  async verifyPassword(id: number, password: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user || user.status !== UserStatus.ACTIVE || !user.password) return false;
    return bcrypt.compare(password, user.password);
  }

  async findById(id: number): Promise<SafeUser | null> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) return null;
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * JWT validate용: status/role 확인을 위해 id, nickname, status, role 반환
   * password는 제외, status는 포함 (findById와 다른 점)
   */
  async findByIdWithStatus(
    id: number,
  ): Promise<Pick<User, 'id' | 'nickname' | 'status' | 'role'> | null> {
    const user = await this.usersRepo.findOne({
      where: { id },
      select: ['id', 'nickname', 'status', 'role'],
    });
    return user ?? null;
  }

  private isReservedNickname(nickname: string): boolean {
    const reserved = ['admin', 'filmott', 'deleted'];
    const lower = nickname.toLowerCase();
    return reserved.some((w) => lower.startsWith(w));
  }

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { nickname, email, password } = createUserDto;

    if (this.isReservedNickname(nickname)) {
      throw new ConflictException('사용할 수 없는 닉네임입니다.');
    }

    // Check if user already exists
    const existingNickname = await this.findOne(nickname);
    if (existingNickname) {
      throw new ConflictException('이미 사용 중인 닉네임입니다.');
    }
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = this.usersRepo.create({
      nickname,
      email,
      password: hashedPassword,
    });

    const savedUser = await this.usersRepo.save(newUser);

    // Return user without password
    const { password: _, ...result } = savedUser;
    return result;
  }

  /**
   * 소셜 유저 생성 (닉네임 + provider + providerId + email(nullable) + password null)
   */
  async createSocialUser(data: {
    nickname: string;
    provider: AuthProvider;
    providerId: string;
    email: string | null;
    profileImage: string | null;
  }): Promise<SafeUser> {
    if (this.isReservedNickname(data.nickname)) {
      throw new ConflictException('사용할 수 없는 닉네임입니다.');
    }

    const existingNickname = await this.findOne(data.nickname);
    if (existingNickname) {
      throw new ConflictException('이미 사용 중인 닉네임입니다.');
    }

    const newUser = this.usersRepo.create({
      nickname: data.nickname,
      email: data.email,
      password: null,
      provider: data.provider,
      providerId: data.providerId,
      profileImage: data.profileImage ?? undefined,
    });

    const savedUser = await this.usersRepo.save(newUser);
    const { password: _, ...result } = savedUser;
    return result;
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // Handle nickname change
    if (updateUserDto.nickname && updateUserDto.nickname !== user.nickname) {
      if (this.isReservedNickname(updateUserDto.nickname)) {
        throw new ConflictException('사용할 수 없는 닉네임입니다.');
      }
      const existing = await this.findOne(updateUserDto.nickname);
      if (existing) {
        throw new ConflictException('이미 사용 중인 닉네임입니다.');
      }
      user.nickname = updateUserDto.nickname;
    }

    // Handle password change (LOCAL 유저만 비밀번호 변경 가능)
    if (updateUserDto.newPassword) {
      if (!updateUserDto.currentPassword) {
        throw new BadRequestException(
          '비밀번호 변경을 위해 현재 비밀번호를 입력해주세요.',
        );
      }
      if (!user.password) {
        throw new BadRequestException(
          '소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.',
        );
      }
      const isMatch = await bcrypt.compare(
        updateUserDto.currentPassword,
        user.password,
      );
      if (!isMatch) {
        throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.');
      }
      user.password = await bcrypt.hash(updateUserDto.newPassword, 10);
    }

    const savedUser = await this.usersRepo.save(user);
    const { password: _, ...result } = savedUser;
    return result;
  }

  async deactivate(id: number): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 해당 유저의 모든 refresh token 삭제 (탈퇴 후 기존 토큰으로 접근 차단)
    await this.refreshTokenRepo.delete({ userId: id });

    // Anonymize to release unique constraints
    const timestamp = Date.now();
    user.nickname = `deleted_${user.id}_${timestamp}`;
    user.email = `deleted_${user.id}_${timestamp}@deleted.local`;
    user.status = UserStatus.DELETED;
    await this.usersRepo.save(user);
  }
}
