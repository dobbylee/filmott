import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { SocialProfile } from '../interfaces/social-profile.interface';

interface NaverTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface NaverProfileResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email?: string;
    nickname?: string;
    profile_image?: string;
    name?: string;
  };
}

@Injectable()
export class NaverService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('NAVER_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>(
      'NAVER_CLIENT_SECRET',
    );
    this.callbackUrl =
      this.configService.getOrThrow<string>('NAVER_CALLBACK_URL');
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      state,
    });
    return `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;
  }

  async getProfile(code: string, state: string): Promise<SocialProfile> {
    const tokenData = await this.exchangeToken(code, state);
    return this.fetchUserInfo(tokenData.access_token);
  }

  private async exchangeToken(
    code: string,
    state: string,
  ): Promise<NaverTokenResponse> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        state,
      });
      const { data } = await firstValueFrom(
        this.httpService.post<NaverTokenResponse>(
          'https://nid.naver.com/oauth2.0/token',
          params.toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      return data;
    } catch {
      throw new InternalServerErrorException('Naver 토큰 교환에 실패했습니다.');
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<SocialProfile> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<NaverProfileResponse>(
          'https://openapi.naver.com/v1/nid/me',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      const profile = data.response;
      return {
        provider: AuthProvider.NAVER,
        providerId: profile.id,
        email: profile.email ?? null,
        nickname: profile.nickname ?? null,
        profileImage: profile.profile_image ?? null,
      };
    } catch {
      throw new InternalServerErrorException(
        'Naver 사용자 정보 조회에 실패했습니다.',
      );
    }
  }
}
