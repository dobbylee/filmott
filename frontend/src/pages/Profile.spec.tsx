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
    const newPasswordInput = screen.getByPlaceholderText(/^new password$/i);
    fireEvent.change(newPasswordInput, { target: { value: 'newpass123' } });

    // Submit form
    const saveButton = screen.getByText(/save changes/i);
    fireEvent.click(saveButton);

    expect(await screen.findByText(/Current password is required to change password/i)).toBeInTheDocument();
  });

  it('should display error if new passwords do not match', async () => {
    renderProfile();

    const currentPassInput = screen.getByPlaceholderText(/leave blank if not changing/i);
    const newPassInput = screen.getByPlaceholderText(/^new password$/i);
    const confirmPassInput = screen.getByPlaceholderText(/confirm new password/i);

    fireEvent.change(currentPassInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPassInput, { target: { value: 'newpass123' } });
    fireEvent.change(confirmPassInput, { target: { value: 'mismatch123' } });

    const saveButton = screen.getByText(/save changes/i);
    fireEvent.click(saveButton);

    expect(await screen.findByText(/New passwords do not match/i)).toBeInTheDocument();
  });

  it('should render email field as disabled/read-only', () => {
    renderProfile();

    // Look for the input holding the test user's email
    const emailInput = screen.getByDisplayValue('test@example.com') as HTMLInputElement;
    expect(emailInput).toBeInTheDocument();
    expect(emailInput.disabled).toBe(true);
  });
});
