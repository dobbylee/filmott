import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminGetUsersDto } from './dto/admin-get-users.dto';
import { AdminUpdateStatusDto } from './dto/admin-update-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from './enums/user-role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 닉네임 중복 체크 (인증 없이 접근 가능 -> rate limit 강화)
  @Get('check-nickname/:nickname')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
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

  // Deactivate current user's account (status -> DELETED)
  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@CurrentUser() user: JwtPayload) {
    await this.usersService.deactivate(user.id);
  }

  // 프로필 이미지 업로드 (multipart/form-data)
  @UseGuards(JwtAuthGuard)
  @Post('me/profile-image')
  @UseInterceptors(FileInterceptor('image'))
  async uploadProfileImage(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('이미지 파일을 선택해주세요.');
    }
    return this.usersService.updateProfileImage(user.id, file);
  }

  // 프로필 이미지 삭제
  @UseGuards(JwtAuthGuard)
  @Delete('me/profile-image')
  async deleteProfileImage(@CurrentUser() user: JwtPayload) {
    return this.usersService.removeProfileImage(user.id);
  }

  // ADMIN 전용: 유저 목록 조회 (검색, 상태 필터, 페이지네이션)
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdminUsers(@Query() dto: AdminGetUsersDto) {
    return this.usersService.findAllForAdmin(dto);
  }

  // ADMIN 전용: 유저 상태 변경 (ACTIVE/SUSPENDED)
  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUserStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminUpdateStatusDto,
  ) {
    return this.usersService.updateStatusByAdmin(id, dto.status);
  }

  // 공개 프로필 조회 (인증 불필요)
  // 주의: :id 와일드카드이므로 고정 경로(me, admin, check-nickname) 아래에 배치
  @Get(':id/profile')
  async getPublicProfile(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getPublicProfile(id);
  }
}
