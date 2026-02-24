import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, SafeUser } from './user.entity';
import { Post } from '../posts/post.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Post)
    private readonly postsRepo: Repository<Post>,
  ) {}

  async findOne(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findById(id: number): Promise<SafeUser | null> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { username, email, password } = createUserDto;

    // Check if user already exists
    const existingUser = await this.findOne(username);
    if (existingUser) {
      throw new ConflictException('Username is already taken');
    }
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('Email is already taken');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = this.usersRepo.create({
      username,
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

    // Handle username change
    if (updateUserDto.username && updateUserDto.username !== user.username) {
      const existing = await this.findOne(updateUserDto.username);
      if (existing) {
        throw new ConflictException('Username is already taken');
      }
      user.username = updateUserDto.username;
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = savedUser;
    return result;
  }

  async softRemove(id: number): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Nullify author on all posts by this user (ON DELETE SET NULL doesn't fire on soft delete)
    await this.postsRepo.update({ author: { id } }, { author: null });

    // Anonymize to release unique constraints
    const timestamp = Date.now();
    user.username = `deleted_${user.id}_${timestamp}`;
    user.email = `deleted_${user.id}_${timestamp}@deleted.local`;
    await this.usersRepo.save(user);

    await this.usersRepo.softDelete(id);
  }
}
