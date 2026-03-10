import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 닉네임 중복 체크
  @Get('check-nickname/:nickname')
  async checkNickname(@Param('nickname') nickname: string) {
    const available = await this.usersService.isNicknameAvailable(nickname);
    return { available };
  }

  // Get current user's profile
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: JwtPayload) {
    const profile = await this.usersService.findById(user.id);
    if (!profile) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    return profile;
  }

  // 현재 비밀번호 확인 (400 반환, 401 아님)
  @UseGuards(JwtAuthGuard)
  @Post('me/verify-password')
  @HttpCode(HttpStatus.OK)
  async verifyPassword(
    @CurrentUser() user: JwtPayload,
    @Body('password') password: string,
  ) {
    if (!password) {
      throw new BadRequestException('비밀번호를 입력해주세요.');
    }
    const valid = await this.usersService.verifyPassword(user.id, password);
    if (!valid) {
      throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.');
    }
    return { verified: true };
  }

  // Update current user's profile
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  update(
    @CurrentUser() user: JwtPayload,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(user.id, updateUserDto);
  }

  // Soft delete current user's account
  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload) {
    await this.usersService.softRemove(user.id);
  }
}
