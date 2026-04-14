import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { KakaoService } from './kakao.service';
import { AuthProvider } from '../../users/enums/auth-provider.enum';

describe('KakaoService', () => {
  let service: KakaoService;
  let httpService: HttpService;

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        KAKAO_CLIENT_ID: 'test-kakao-client-id',
        KAKAO_CLIENT_SECRET: 'test-kakao-client-secret',
        KAKAO_CALLBACK_URL: 'http://localhost:3001/auth/kakao/callback',
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
        KakaoService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<KakaoService>(KakaoService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthUrl', () => {
    it('올바른 Kakao OAuth2 인증 URL을 생성해야 한다', () => {
      const state = 'random-state-string';
      const url = service.getAuthUrl(state);

      expect(url).toContain('https://kauth.kakao.com/oauth/authorize');
      expect(url).toContain('client_id=test-kakao-client-id');
      expect(url).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fkakao%2Fcallback',
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain(`state=${state}`);
    });
  });

  describe('getProfile', () => {
    const mockTokenResponse: AxiosResponse = {
      data: {
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const mockUserResponse: AxiosResponse = {
      data: {
        id: 9876543210,
        properties: {
          nickname: 'KakaoUser',
          profile_image: 'http://k.kakaocdn.net/dn/profile.jpg',
        },
        kakao_account: {
          profile: {
            nickname: 'KakaoUser',
            profile_image_url: 'http://k.kakaocdn.net/dn/profile.jpg',
          },
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    it('정상 응답 시 SocialProfile을 반환해야 한다 (이메일은 항상 null)', async () => {
      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(mockUserResponse));

      const result = await service.getProfile('auth-code');

      expect(result).toEqual({
        provider: AuthProvider.KAKAO,
        providerId: '9876543210',
        email: null,
        nickname: 'KakaoUser',
        profileImage: 'http://k.kakaocdn.net/dn/profile.jpg',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://kauth.kakao.com/oauth/token',
        expect.any(String),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      expect(httpService.get).toHaveBeenCalledWith(
        'https://kapi.kakao.com/v2/user/me',
        { headers: { Authorization: 'Bearer kakao-access-token' } },
      );
    });

    it('kakao_account.profile이 우선, 없으면 properties에서 가져와야 한다', async () => {
      const propertiesOnlyResponse: AxiosResponse = {
        data: {
          id: 9876543210,
          properties: {
            nickname: 'PropsNickname',
            profile_image: 'http://k.kakaocdn.net/dn/props.jpg',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(propertiesOnlyResponse));

      const result = await service.getProfile('auth-code');

      expect(result.nickname).toBe('PropsNickname');
      expect(result.profileImage).toBe('http://k.kakaocdn.net/dn/props.jpg');
    });

    it('닉네임/프로필 이미지 정보가 없는 경우 null을 반환해야 한다', async () => {
      const minimalResponse: AxiosResponse = {
        data: { id: 9876543210 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(minimalResponse));

      const result = await service.getProfile('auth-code');

      expect(result).toEqual({
        provider: AuthProvider.KAKAO,
        providerId: '9876543210',
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
        'Kakao 토큰 교환에 실패했습니다.',
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
        'Kakao 사용자 정보 조회에 실패했습니다.',
      );
    });
  });
});
