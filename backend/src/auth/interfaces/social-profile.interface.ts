import { AuthProvider } from '../../users/enums/auth-provider.enum';

export interface SocialProfile {
  provider: AuthProvider;
  providerId: string;
  email: string | null;
  nickname: string | null;
  profileImage: string | null;
}
