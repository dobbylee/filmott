import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CompleteSocialSignupDto } from './dto/complete-social-signup.dto';
import { GoogleService } from './social/google.service';
import { KakaoService } from './social/kakao.service';
import { NaverService } from './social/naver.service';

const OAUTH_STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_MAX_AGE = 5 * 60 * 1000; // 5분

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly frontendUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly googleService: GoogleService,
    private readonly kakaoService: KakaoService,
    private readonly naverService: NaverService,
  ) {
    this.frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
  }

  // --- 기존 엔드포인트 ---

  @Post('signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refresh_token);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async logout(@Body() refreshTokenDto: RefreshTokenDto) {
    await this.authService.revokeRefreshToken(refreshTokenDto.refresh_token);
  }

  // --- 소셜 로그인 엔드포인트 ---

  @Get('google')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  googleRedirect(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    this.setStateCookie(res, state);
    const url = this.googleService.getAuthUrl(state);
    return res.redirect(url);
  }

  @Get('google/callback')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    return this.handleSocialCallback(res, 'google', code, state, async () => {
      return this.googleService.getProfile(code);
    });
  }

  @Get('kakao')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  kakaoRedirect(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    this.setStateCookie(res, state);
    const url = this.kakaoService.getAuthUrl(state);
    return res.redirect(url);
  }

  @Get('kakao/callback')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async kakaoCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    return this.handleSocialCallback(res, 'kakao', code, state, async () => {
      return this.kakaoService.getProfile(code);
    });
  }

  @Get('naver')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  naverRedirect(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    this.setStateCookie(res, state);
    const url = this.naverService.getAuthUrl(state);
    return res.redirect(url);
  }

  @Get('naver/callback')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async naverCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    return this.handleSocialCallback(res, 'naver', code, state, async () => {
      return this.naverService.getProfile(code, state);
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('social/complete-signup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async completeSocialSignup(@Body() dto: CompleteSocialSignupDto) {
    return this.authService.completeSocialSignup(dto.tempToken, dto.nickname);
  }

  // --- Private helpers ---

  private setStateCookie(res: Response, state: string): void {
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // 개발 환경에서는 false, 프로덕션에서는 true로 변경
      maxAge: STATE_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  private verifyState(res: Response, urlState: string): boolean {
    const request = (res as { req?: { cookies?: Record<string, string> } }).req;
    const cookieState = request?.cookies?.[OAUTH_STATE_COOKIE];

    // state 쿠키 삭제
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    if (!cookieState || !urlState || cookieState !== urlState) {
      return false;
    }
    return true;
  }

  private async handleSocialCallback(
    res: Response,
    provider: string,
    code: string,
    state: string,
    getProfile: () => ReturnType<typeof this.googleService.getProfile>,
  ): Promise<void> {
    const callbackUrl = `${this.frontendUrl}/auth/callback`;

    try {
      if (!code) {
        res.redirect(`${callbackUrl}?error=missing_code`);
        return;
      }

      if (!this.verifyState(res, state)) {
        res.redirect(`${callbackUrl}?error=invalid_state`);
        return;
      }

      const profile = await getProfile();
      const result = await this.authService.handleSocialCallback(profile);

      if (result.type === 'existing') {
        const params = new URLSearchParams({
          token: result.tokens.access_token,
          refresh: result.tokens.refresh_token,
        });
        res.redirect(`${callbackUrl}?${params.toString()}`);
      } else {
        const params = new URLSearchParams({
          new: 'true',
          tempToken: result.tempToken,
        });
        res.redirect(`${callbackUrl}?${params.toString()}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      res.redirect(`${callbackUrl}?error=${encodeURIComponent(message)}`);
    }
  }
}
