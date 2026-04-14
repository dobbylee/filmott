import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { SocialProfile } from '../interfaces/social-profile.interface';

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>(
      'GOOGLE_CLIENT_SECRET',
    );
    this.callbackUrl = this.configService.getOrThrow<string>(
      'GOOGLE_CALLBACK_URL',
    );
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async getProfile(code: string): Promise<SocialProfile> {
    const tokenData = await this.exchangeToken(code);
    return this.fetchUserInfo(tokenData.access_token);
  }

  private async exchangeToken(code: string): Promise<GoogleTokenResponse> {
    try {
      const params = new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        grant_type: 'authorization_code',
      });
      const { data } = await firstValueFrom(
        this.httpService.post<GoogleTokenResponse>(
          'https://oauth2.googleapis.com/token',
          params.toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      return data;
    } catch {
      throw new InternalServerErrorException(
        'Google 토큰 교환에 실패했습니다.',
      );
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<SocialProfile> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<GoogleUserInfo>(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );
      return {
        provider: AuthProvider.GOOGLE,
        providerId: data.id,
        email: data.email ?? null,
        nickname: data.name ?? null,
        profileImage: data.picture ?? null,
      };
    } catch {
      throw new InternalServerErrorException(
        'Google 사용자 정보 조회에 실패했습니다.',
      );
    }
  }
}
