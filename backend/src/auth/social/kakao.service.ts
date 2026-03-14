import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { SocialProfile } from '../interfaces/social-profile.interface';

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

interface KakaoUserResponse {
  id: number;
  properties?: {
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
  kakao_account?: {
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
}

@Injectable()
export class KakaoService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('KAKAO_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('KAKAO_CLIENT_SECRET');
    this.callbackUrl = this.configService.getOrThrow<string>('KAKAO_CALLBACK_URL');
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      state,
    });
    return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  }

  async getProfile(code: string): Promise<SocialProfile> {
    const tokenData = await this.exchangeToken(code);
    return this.fetchUserInfo(tokenData.access_token);
  }

  private async exchangeToken(code: string): Promise<KakaoTokenResponse> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        code,
      });
      const { data } = await firstValueFrom(
        this.httpService.post<KakaoTokenResponse>(
          'https://kauth.kakao.com/oauth/token',
          params.toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      return data;
    } catch {
      throw new InternalServerErrorException('Kakao 토큰 교환에 실패했습니다.');
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<SocialProfile> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<KakaoUserResponse>(
          'https://kapi.kakao.com/v2/user/me',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      const nickname =
        data.kakao_account?.profile?.nickname ??
        data.properties?.nickname ??
        null;
      const profileImage =
        data.kakao_account?.profile?.profile_image_url ??
        data.properties?.profile_image ??
        null;

      return {
        provider: AuthProvider.KAKAO,
        providerId: String(data.id),
        email: null, // 비즈 앱이 아니므로 이메일 수집 불가
        nickname,
        profileImage,
      };
    } catch {
      throw new InternalServerErrorException('Kakao 사용자 정보 조회에 실패했습니다.');
    }
  }
}
