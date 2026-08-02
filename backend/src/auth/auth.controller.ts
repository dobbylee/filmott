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
  HttpException,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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

const LEGACY_OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_PREFIX = 'oauth_state_';
const OAUTH_STATE_PATTERN = /^[a-f0-9]{32}$/;
const STATE_COOKIE_MAX_AGE = 5 * 60 * 1000; // 5분
const INTERNAL_FRONTEND_HOSTNAMES = new Set([
  'frontend',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

type SocialLoginProvider = 'google' | 'kakao' | 'naver';
type OAuthStateFailureReason =
  | 'invalid_state_format'
  | 'missing_query_state'
  | 'missing_state_cookie'
  | 'provider_mismatch';
type OAuthStateVerificationResult =
  | { valid: true }
  | { valid: false; reason: OAuthStateFailureReason };
type AuthFailureReason =
  | 'deleted'
  | 'invalid_state'
  | 'missing_code'
  | 'social_auth_failed'
  | 'suspended';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
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
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.getRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException('리프레시 토큰이 필요합니다.');
    }

    const session = await this.authService.refreshTokens(refreshToken);
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = this.getRefreshToken(req);
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
    this.setStateCookie(res, 'google', state);
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
    return this.handleSocialCallback(
      'google',
      req,
      res,
      code,
      state,
      async () => {
        return this.googleService.getProfile(code);
      },
    );
  }

  @Get('kakao')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  kakaoRedirect(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    this.setStateCookie(res, 'kakao', state);
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
    return this.handleSocialCallback(
      'kakao',
      req,
      res,
      code,
      state,
      async () => {
        return this.kakaoService.getProfile(code);
      },
    );
  }

  @Get('naver')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  naverRedirect(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    this.setStateCookie(res, 'naver', state);
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
    return this.handleSocialCallback(
      'naver',
      req,
      res,
      code,
      state,
      async () => {
        return this.naverService.getProfile(code, state);
      },
    );
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

  private setStateCookie(
    res: Response,
    provider: SocialLoginProvider,
    state: string,
  ): void {
    res.cookie(this.getStateCookieName(state), provider, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isProduction,
      maxAge: STATE_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  private verifyState(
    provider: SocialLoginProvider,
    req: Request,
    res: Response,
    urlState: unknown,
  ): OAuthStateVerificationResult {
    if (urlState === undefined || urlState === null || urlState === '') {
      return { valid: false, reason: 'missing_query_state' };
    }

    if (typeof urlState !== 'string' || !OAUTH_STATE_PATTERN.test(urlState)) {
      return { valid: false, reason: 'invalid_state_format' };
    }

    const stateCookieName = this.getStateCookieName(urlState);
    const cookieProvider = this.getCookieValue(req, stateCookieName);
    if (cookieProvider) {
      res.clearCookie(stateCookieName, { path: '/' });
      if (cookieProvider !== provider) {
        return { valid: false, reason: 'provider_mismatch' };
      }
      return { valid: true };
    }

    const legacyState = this.getCookieValue(req, LEGACY_OAUTH_STATE_COOKIE);
    if (legacyState === urlState) {
      res.clearCookie(LEGACY_OAUTH_STATE_COOKIE, { path: '/' });
      return { valid: true };
    }

    return { valid: false, reason: 'missing_state_cookie' };
  }

  private getStateCookieName(state: string): string {
    return `${OAUTH_STATE_COOKIE_PREFIX}${state}`;
  }

  private getRefreshToken(req: Request): string | undefined {
    return this.getCookieValue(req, AUTH_REFRESH_TOKEN_COOKIE);
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

  private reportAuthFailure(
    provider: SocialLoginProvider,
    reason: AuthFailureReason,
    error?: unknown,
    stateFailureReason?: OAuthStateFailureReason,
  ): void {
    const statusCode =
      error instanceof HttpException ? error.getStatus() : undefined;
    const originalName = error instanceof Error ? error.name : undefined;
    const context = {
      flow: 'social_callback',
      provider,
      reason,
      ...(stateFailureReason ? { stateFailureReason } : {}),
      ...(statusCode ? { statusCode } : {}),
      ...(originalName ? { originalName } : {}),
    };
    const sentryError = new Error(
      `Social auth callback failed: ${provider}/${reason}`,
    );

    this.logger.error(sentryError.message, context);
    Sentry.captureException(sentryError, {
      level: 'error',
      tags: {
        feature: 'auth',
        auth_flow: 'social_callback',
        provider,
        auth_error_reason: reason,
        ...(stateFailureReason
          ? { auth_state_failure_reason: stateFailureReason }
          : {}),
      },
      contexts: {
        auth: context,
      },
    });
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
    provider: SocialLoginProvider,
    req: Request,
    res: Response,
    code: string,
    state: string,
    getProfile: () => ReturnType<typeof this.googleService.getProfile>,
  ): Promise<void> {
    const callbackUrl = `${this.frontendUrl}/auth/callback`;

    try {
      if (!code) {
        this.reportAuthFailure(provider, 'missing_code');
        res.redirect(`${callbackUrl}?error=missing_code`);
        return;
      }

      const stateVerification = this.verifyState(provider, req, res, state);
      if (!stateVerification.valid) {
        this.reportAuthFailure(
          provider,
          'invalid_state',
          undefined,
          stateVerification.reason,
        );
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
      let errorCode: AuthFailureReason = 'social_auth_failed';
      if (error instanceof UnauthorizedException) {
        const message = error.message;
        if (message.includes('정지')) errorCode = 'suspended';
        else if (message.includes('탈퇴')) errorCode = 'deleted';
      }
      this.reportAuthFailure(provider, errorCode, error);
      res.redirect(`${callbackUrl}?error=${errorCode}`);
    }
  }
}
