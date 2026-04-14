import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
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
import {
  AUTH_REFRESH_TOKEN_COOKIE,
  SOCIAL_SIGNUP_COOKIE,
  clearAuthCookies,
  clearSocialSignupCookie,
  setAuthCookies,
  setSocialSignupCookie,
} from './auth-cookie.util';

const OAUTH_STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_MAX_AGE = 5 * 60 * 1000; // 5분
const INTERNAL_FRONTEND_HOSTNAMES = new Set([
  'frontend',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly frontendUrl: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly googleService: GoogleService,
    private readonly kakaoService: KakaoService,
    private readonly naverService: NaverService,
  ) {
    this.frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    this.validateFrontendUrl();
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
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(loginDto);
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(
    @Req() req: Request,
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.getRefreshToken(
      req,
      refreshTokenDto?.refresh_token,
    );
    if (!refreshToken) {
      this.clearSessionCookies(res);
      throw new UnauthorizedException('리프레시 토큰이 필요합니다.');
    }

    try {
      const session = await this.authService.refreshTokens(refreshToken);
      this.setSessionCookies(res, session);
      return { user: session.user };
    } catch (error) {
      this.clearSessionCookies(res);
      throw error;
    }
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async logout(
    @Req() req: Request,
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.getRefreshToken(
      req,
      refreshTokenDto?.refresh_token,
    );
    try {
      if (refreshToken) {
        await this.authService.revokeRefreshToken(refreshToken);
      }
    } finally {
      this.clearSessionCookies(res);
    }
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
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleSocialCallback(req, res, code, state, async () => {
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
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleSocialCallback(req, res, code, state, async () => {
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
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleSocialCallback(req, res, code, state, async () => {
      return this.naverService.getProfile(code, state);
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('social/complete-signup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async completeSocialSignup(
    @Req() req: Request,
    @Body() dto: CompleteSocialSignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const signupToken = this.getSocialSignupToken(req) ?? dto.signupToken;
    if (!signupToken) {
      this.clearSignupCookie(res);
      throw new BadRequestException(
        '회원가입 세션이 만료되었습니다. 다시 시도해주세요.',
      );
    }

    try {
      const session = await this.authService.completeSocialSignup(
        signupToken,
        dto.nickname,
        dto.subscribedOtts,
      );
      this.clearSignupCookie(res);
      this.setSessionCookies(res, session);
      return { user: session.user };
    } catch (error) {
      this.clearSignupCookie(res);
      throw error;
    }
  }

  // --- Private helpers ---

  private setStateCookie(res: Response, state: string): void {
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isProduction,
      maxAge: STATE_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  private verifyState(req: Request, res: Response, urlState: string): boolean {
    const cookieState = this.getCookieValue(req, OAUTH_STATE_COOKIE);

    // state 쿠키 삭제
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    if (!cookieState || !urlState || cookieState !== urlState) {
      return false;
    }
    return true;
  }

  private getRefreshToken(
    req: Request,
    bodyRefreshToken?: string,
  ): string | undefined {
    return (
      this.getCookieValue(req, AUTH_REFRESH_TOKEN_COOKIE) ?? bodyRefreshToken
    );
  }

  private getSocialSignupToken(req: Request): string | undefined {
    return this.getCookieValue(req, SOCIAL_SIGNUP_COOKIE);
  }

  private getCookieValue(req: Request, cookieName: string): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const cookieValue = cookies?.[cookieName];
    return typeof cookieValue === 'string' && cookieValue.length > 0
      ? cookieValue
      : undefined;
  }

  private setSessionCookies(
    res: Response,
    tokens: { access_token: string; refresh_token: string },
  ): void {
    setAuthCookies(res, tokens, this.isProduction);
  }

  private clearSessionCookies(res: Response): void {
    clearAuthCookies(res, this.isProduction);
  }

  private setSignupCookie(res: Response, signupToken: string): void {
    setSocialSignupCookie(res, signupToken, this.isProduction);
  }

  private clearSignupCookie(res: Response): void {
    clearSocialSignupCookie(res, this.isProduction);
  }

  private validateFrontendUrl(): void {
    if (!this.isProduction) {
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(this.frontendUrl);
    } catch {
      throw new Error('FRONTEND_URL must be an absolute URL.');
    }

    if (INTERNAL_FRONTEND_HOSTNAMES.has(parsedUrl.hostname)) {
      throw new Error(
        'FRONTEND_URL must be a public browser-reachable origin in production.',
      );
    }
  }

  private async handleSocialCallback(
    req: Request,
    res: Response,
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

      if (!this.verifyState(req, res, state)) {
        res.redirect(`${callbackUrl}?error=invalid_state`);
        return;
      }

      const profile = await getProfile();
      const result = await this.authService.handleSocialCallback(profile);

      if (result.type === 'existing') {
        this.clearSignupCookie(res);
        this.setSessionCookies(res, result.session);
        const params = new URLSearchParams({ status: 'success' });
        res.redirect(`${callbackUrl}?${params.toString()}`);
      } else {
        this.setSignupCookie(res, result.signupToken);
        const params = new URLSearchParams({ new: 'true' });
        res.redirect(
          `${callbackUrl}?${params.toString()}#signup=${encodeURIComponent(result.signupToken)}`,
        );
      }
    } catch (error) {
      let errorCode = 'social_auth_failed';
      if (error instanceof UnauthorizedException) {
        const message = error.message;
        if (message.includes('정지')) errorCode = 'suspended';
        else if (message.includes('탈퇴')) errorCode = 'deleted';
      }
      res.redirect(`${callbackUrl}?error=${errorCode}`);
    }
  }
}
