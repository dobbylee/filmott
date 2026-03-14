import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { GoogleService } from './google.service';
import { AuthProvider } from '../../users/enums/auth-provider.enum';

describe('GoogleService', () => {
  let service: GoogleService;
  let httpService: HttpService;

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3001/auth/google/callback',
      };
      return config[key];
    }),
  };

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<GoogleService>(GoogleService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthUrl', () => {
    it('올바른 Google OAuth2 인증 URL을 생성해야 한다', () => {
      const state = 'random-state-string';
      const url = service.getAuthUrl(state);

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fgoogle%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=openid+email+profile');
      expect(url).toContain(`state=${state}`);
    });
  });

  describe('getProfile', () => {
    const mockTokenResponse: AxiosResponse = {
      data: {
        access_token: 'google-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const mockUserInfoResponse: AxiosResponse = {
      data: {
        id: '123456789',
        email: 'user@gmail.com',
        name: 'Test User',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    it('정상 응답 시 SocialProfile을 반환해야 한다', async () => {
      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(mockUserInfoResponse));

      const result = await service.getProfile('auth-code');

      expect(result).toEqual({
        provider: AuthProvider.GOOGLE,
        providerId: '123456789',
        email: 'user@gmail.com',
        nickname: 'Test User',
        profileImage: 'https://lh3.googleusercontent.com/photo.jpg',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        {
          code: 'auth-code',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uri: 'http://localhost:3001/auth/google/callback',
          grant_type: 'authorization_code',
        },
      );

      expect(httpService.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: 'Bearer google-access-token' } },
      );
    });

    it('이메일/이름/사진이 없는 경우 null을 반환해야 한다', async () => {
      const minimalUserInfo: AxiosResponse = {
        data: { id: '123456789' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(minimalUserInfo));

      const result = await service.getProfile('auth-code');

      expect(result).toEqual({
        provider: AuthProvider.GOOGLE,
        providerId: '123456789',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('토큰 교환 실패 시 InternalServerErrorException을 던져야 한다', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network Error')),
      );

      await expect(service.getProfile('invalid-code')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.getProfile('invalid-code')).rejects.toThrow(
        'Google 토큰 교환에 실패했습니다.',
      );
    });

    it('사용자 정보 조회 실패 시 InternalServerErrorException을 던져야 한다', async () => {
      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error')),
      );

      await expect(service.getProfile('auth-code')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.getProfile('auth-code')).rejects.toThrow(
        'Google 사용자 정보 조회에 실패했습니다.',
      );
    });
  });
});
