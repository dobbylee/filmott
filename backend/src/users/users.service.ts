import { Injectable, ConflictException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

export interface User {
  id: number;
  username: string;
  email: string;
  password?: string; // Optional since we remove it before returning
}

@Injectable()
export class UsersService {
  // Mock In-Memory Repository
  private readonly users: User[] = [];

  async findOne(username: string): Promise<User | undefined> {
    return this.users.find((user) => user.username === username);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
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

    const newUser = {
      id: this.users.length + 1,
      username,
      email,
      password: hashedPassword,
    };

    this.users.push(newUser);

    // Return user without password
    const { password, ...result } = newUser;
    return result as User;
  }
}
