import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { NaverService } from './naver.service';
import { AuthProvider } from '../../users/enums/auth-provider.enum';

describe('NaverService', () => {
  let service: NaverService;
  let httpService: HttpService;

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        NAVER_CLIENT_ID: 'test-naver-client-id',
        NAVER_CLIENT_SECRET: 'test-naver-client-secret',
        NAVER_CALLBACK_URL: 'http://localhost:3001/auth/naver/callback',
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
        NaverService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<NaverService>(NaverService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthUrl', () => {
    it('올바른 Naver OAuth2 인증 URL을 생성해야 한다 (state 파라미터 포함)', () => {
      const state = 'random-state-string';
      const url = service.getAuthUrl(state);

      expect(url).toContain('https://nid.naver.com/oauth2.0/authorize');
      expect(url).toContain('client_id=test-naver-client-id');
      expect(url).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fnaver%2Fcallback',
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain(`state=${state}`);
    });
  });

  describe('getProfile', () => {
    const mockTokenResponse: AxiosResponse = {
      data: {
        access_token: 'naver-access-token',
        refresh_token: 'naver-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const mockProfileResponse: AxiosResponse = {
      data: {
        resultcode: '00',
        message: 'success',
        response: {
          id: 'naver-unique-id-12345',
          email: 'user@naver.com',
          nickname: 'NaverUser',
          profile_image: 'https://phinf.pstatic.net/contact/profile.png',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    it('정상 응답 시 SocialProfile을 반환해야 한다', async () => {
      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(mockProfileResponse));

      const result = await service.getProfile('auth-code', 'state-value');

      expect(result).toEqual({
        provider: AuthProvider.NAVER,
        providerId: 'naver-unique-id-12345',
        email: 'user@naver.com',
        nickname: 'NaverUser',
        profileImage: 'https://phinf.pstatic.net/contact/profile.png',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://nid.naver.com/oauth2.0/token',
        expect.any(String),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      // state가 토큰 교환 요청에 포함되는지 확인
      const postCallBody = mockHttpService.post.mock.calls[0][1] as string;
      expect(postCallBody).toContain('state=state-value');
      expect(postCallBody).toContain('code=auth-code');

      expect(httpService.get).toHaveBeenCalledWith(
        'https://openapi.naver.com/v1/nid/me',
        { headers: { Authorization: 'Bearer naver-access-token' } },
      );
    });

    it('이메일/닉네임/프로필이미지가 없는 경우 null을 반환해야 한다', async () => {
      const minimalProfileResponse: AxiosResponse = {
        data: {
          resultcode: '00',
          message: 'success',
          response: {
            id: 'naver-unique-id-12345',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(of(minimalProfileResponse));

      const result = await service.getProfile('auth-code', 'state-value');

      expect(result).toEqual({
        provider: AuthProvider.NAVER,
        providerId: 'naver-unique-id-12345',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('토큰 교환 실패 시 InternalServerErrorException을 던져야 한다', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network Error')),
      );

      await expect(service.getProfile('invalid-code', 'state')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.getProfile('invalid-code', 'state')).rejects.toThrow(
        'Naver 토큰 교환에 실패했습니다.',
      );
    });

    it('사용자 정보 조회 실패 시 InternalServerErrorException을 던져야 한다', async () => {
      mockHttpService.post.mockReturnValue(of(mockTokenResponse));
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error')),
      );

      await expect(service.getProfile('auth-code', 'state')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.getProfile('auth-code', 'state')).rejects.toThrow(
        'Naver 사용자 정보 조회에 실패했습니다.',
      );
    });
  });
});
