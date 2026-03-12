import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
