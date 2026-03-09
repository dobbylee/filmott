import { render, screen, fireEvent } from '@testing-library/react';
import Profile from './Profile';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { describe, it, expect, vi } from 'vitest';

// Make sure to match exact text or regex
describe('Profile Page Form Validation', () => {
  const mockUser = { id: 1, username: 'testuser', email: 'test@example.com' };
  
  const renderProfile = () => {
    return render(
      <AuthContext.Provider value={{
        user: mockUser,
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      }}>
        <BrowserRouter>
          <Profile />
        </BrowserRouter>
      </AuthContext.Provider>
    );
  };

  it('should display error if new password is provided without current password', async () => {
    renderProfile();

    // Fill new password but leave current blank
    const newPasswordInput = screen.getByPlaceholderText(/^새 비밀번호$/i);
    fireEvent.change(newPasswordInput, { target: { value: 'newpass123' } });

    // Submit form
    const saveButton = screen.getByText(/^저장$/i);
    fireEvent.click(saveButton);

    expect(await screen.findByText(/비밀번호 변경을 위해 현재 비밀번호를 입력해주세요/i)).toBeInTheDocument();
  });

  it('should display error if new passwords do not match', async () => {
    renderProfile();

    const currentPassInput = screen.getByPlaceholderText(/변경하지 않을 경우 비워두세요/i);
    const newPassInput = screen.getByPlaceholderText(/^새 비밀번호$/i);
    const confirmPassInput = screen.getByPlaceholderText(/새 비밀번호 확인/i);

    fireEvent.change(currentPassInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPassInput, { target: { value: 'newpass123' } });
    fireEvent.change(confirmPassInput, { target: { value: 'mismatch123' } });

    const saveButton = screen.getByText(/^저장$/i);
    fireEvent.click(saveButton);

    expect(await screen.findByText(/새 비밀번호가 일치하지 않습니다/i)).toBeInTheDocument();
  });

  it('should render email field as disabled/read-only', () => {
    renderProfile();

    // Look for the input holding the test user's email
    const emailInput = screen.getByDisplayValue('test@example.com') as HTMLInputElement;
    expect(emailInput).toBeInTheDocument();
    expect(emailInput.disabled).toBe(true);
  });
});
