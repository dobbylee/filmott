import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, SafeUser } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findOne(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
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
    const { password: _pw, ...result } = savedUser;
    return result;
  }
}
