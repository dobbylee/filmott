import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileImageUploader from '../ProfileImageUploader';
import type { User } from '@/types/auth';

// api mock
vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// next/image mock
vi.mock('next/image', () => ({
  default: ({ src, alt, onError, ...props }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src as string}
      alt={alt as string}
      onError={onError as React.ReactEventHandler<HTMLImageElement>}
      {...props}
    />
  ),
}));

import api from '@/lib/api';

describe('ProfileImageUploader', () => {
  const mockUpdateUser = vi.fn();
  const baseUser: User = {
    id: 1,
    nickname: '테스트유저',
    email: 'test@test.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('프로필 이미지가 없으면 닉네임 이니셜을 표시해야 한다', () => {
    render(<ProfileImageUploader user={baseUser} updateUser={mockUpdateUser} />);
    expect(screen.getByText('테')).toBeInTheDocument();
  });

  it('프로필 이미지가 있으면 이미지를 표시해야 한다', () => {
    const userWithImage = { ...baseUser, profileImage: 'https://test.r2.dev/profiles/test.webp' };
    render(<ProfileImageUploader user={userWithImage} updateUser={mockUpdateUser} />);
    const img = screen.getByAltText('테스트유저');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://test.r2.dev/profiles/test.webp');
  });

  it('프로필 이미지가 있을 때 삭제 버튼이 표시되어야 한다', () => {
    const userWithImage = { ...baseUser, profileImage: 'https://test.r2.dev/profiles/test.webp' };
    render(<ProfileImageUploader user={userWithImage} updateUser={mockUpdateUser} />);
    expect(screen.getByLabelText('프로필 이미지 삭제')).toBeInTheDocument();
  });

  it('프로필 이미지가 없을 때 삭제 버튼이 표시되지 않아야 한다', () => {
    render(<ProfileImageUploader user={baseUser} updateUser={mockUpdateUser} />);
    expect(screen.queryByLabelText('프로필 이미지 삭제')).not.toBeInTheDocument();
  });

  it('파일 선택 후 업로드 API를 호출해야 한다', async () => {
    const updatedUser = { ...baseUser, profileImage: 'https://test.r2.dev/profiles/new.webp' };
    vi.mocked(api.post).mockResolvedValue({ data: updatedUser });

    render(<ProfileImageUploader user={baseUser} updateUser={mockUpdateUser} />);

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/users/me/profile-image',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      expect(mockUpdateUser).toHaveBeenCalledWith(updatedUser);
    });
  });

  it('삭제 버튼 클릭 시 삭제 API를 호출해야 한다', async () => {
    const userWithImage = { ...baseUser, profileImage: 'https://test.r2.dev/profiles/test.webp' };
    const updatedUser = { ...baseUser, profileImage: undefined };
    vi.mocked(api.delete).mockResolvedValue({ data: updatedUser });

    render(<ProfileImageUploader user={userWithImage} updateUser={mockUpdateUser} />);

    const deleteBtn = screen.getByLabelText('프로필 이미지 삭제');
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/users/me/profile-image');
      expect(mockUpdateUser).toHaveBeenCalledWith(updatedUser);
    });
  });
});
