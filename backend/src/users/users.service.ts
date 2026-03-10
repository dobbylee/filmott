import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, SafeUser } from './user.entity';
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
    return this.usersRepo.findOne({ where: { nickname } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findById(id: number): Promise<SafeUser | null> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) return null;
    const { password, ...result } = user;
    return result;
  }

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { nickname, email, password } = createUserDto;

    // Check if user already exists
    const existingNickname = await this.findOne(nickname);
    if (existingNickname) {
      throw new ConflictException('Nickname is already taken');
    }
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('Email is already taken');
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
      throw new NotFoundException('User not found');
    }

    // Handle nickname change
    if (updateUserDto.nickname && updateUserDto.nickname !== user.nickname) {
      const existing = await this.findOne(updateUserDto.nickname);
      if (existing) {
        throw new ConflictException('Nickname is already taken');
      }
      user.nickname = updateUserDto.nickname;
    }

    // Handle password change
    if (updateUserDto.newPassword) {
      if (!updateUserDto.currentPassword) {
        throw new BadRequestException(
          'Current password is required to change password',
        );
      }
      const isMatch = await bcrypt.compare(
        updateUserDto.currentPassword,
        user.password,
      );
      if (!isMatch) {
        throw new BadRequestException('Current password is incorrect');
      }
      user.password = await bcrypt.hash(updateUserDto.newPassword, 10);
    }

    const savedUser = await this.usersRepo.save(user);
    const { password, ...result } = savedUser;
    return result;
  }

  async softRemove(id: number): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Anonymize to release unique constraints
    const timestamp = Date.now();
    user.nickname = `deleted_${user.id}_${timestamp}`;
    user.email = `deleted_${user.id}_${timestamp}@deleted.local`;
    await this.usersRepo.save(user);

    await this.usersRepo.softDelete(id);
  }
}
