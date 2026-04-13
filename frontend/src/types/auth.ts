export interface User {
  id: number;
  nickname: string;
  email?: string | null;
  profileImage?: string | null;
  status?: string;
  role?: string;
  provider?: string;
  subscribedOtts?: string[];
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  access_token?: string;
  refresh_token?: string;
}

export interface UpdateProfileRequest {
  nickname?: string;
}

export interface PublicProfile {
  id: number;
  nickname: string;
  profileImage: string | null;
  createdAt: string;
  reviewCount: number;
  watchedCount: number;
  wantToWatchCount: number;
}
