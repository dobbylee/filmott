export interface User {
  id: number;
  nickname: string;
  email?: string | null;
  profileImage?: string;
  status?: string;
  role?: string;
  provider?: string;
  createdAt?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface UpdateProfileRequest {
  nickname?: string;
}
