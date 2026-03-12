import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, SafeUser } from './user.entity';
import { UserStatus } from './enums/user-status.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findOne(nickname: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { nickname, status: UserStatus.ACTIVE },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async isNicknameAvailable(nickname: string): Promise<boolean> {
    const existing = await this.findOne(nickname);
    return !existing;
  }

  async verifyPassword(id: number, password: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user || user.status !== UserStatus.ACTIVE) return false;
    return bcrypt.compare(password, user.password);
  }

  async findById(id: number): Promise<SafeUser | null> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) return null;
    const { password, ...result } = user;
    return result;
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = savedUser;
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

    // Handle password change
    if (updateUserDto.newPassword) {
      if (!updateUserDto.currentPassword) {
        throw new BadRequestException(
          '비밀번호 변경을 위해 현재 비밀번호를 입력해주세요.',
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
    const { password, ...result } = savedUser;
    return result;
  }

  async deactivate(id: number): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // Anonymize to release unique constraints
    const timestamp = Date.now();
    user.nickname = `deleted_${user.id}_${timestamp}`;
    user.email = `deleted_${user.id}_${timestamp}@deleted.local`;
    user.status = UserStatus.DELETED;
    await this.usersRepo.save(user);
  }
}
