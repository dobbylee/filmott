import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User as UserIcon, Mail, Lock, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../utils/error';

interface UpdateProfilePayload {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}

const Profile: React.FC = () => {
  const { user, logout, checkAuth } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email);
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const isUsernameChanged = username !== user?.username;
    const hasPasswordFields = currentPassword || newPassword || confirmPassword;

    // Nothing changed at all
    if (!isUsernameChanged && !hasPasswordFields) {
      setError('변경된 내용이 없습니다.');
      return;
    }

    // currentPassword only — missing new password
    if (currentPassword && !newPassword) {
      setError('새 비밀번호를 입력해주세요.');
      return;
    }

    // newPassword only — missing current password
    if (newPassword && !currentPassword) {
      setError('비밀번호 변경을 위해 현재 비밀번호를 입력해주세요.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setError('새 비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);

    try {
      const payload: UpdateProfilePayload = {};
      if (isUsernameChanged) payload.username = username;
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      await api.patch('/users/me', payload);
      
      // Update local context
      await checkAuth();
      
      setSuccess('프로필이 성공적으로 저장되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '프로필 저장에 실패했습니다.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      await api.delete('/users/me');
      logout();
      navigate('/login');
    } catch {
      alert('계정 삭제에 실패했습니다.');
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Background decorations */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-50/50 blur-3xl"></div>
        <div className="absolute top-[20%] right-[5%] w-[30%] h-[30%] rounded-full bg-slate-100/50 blur-3xl"></div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/posts"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            게시판으로
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <span className="text-2xl font-bold uppercase">{user.username.charAt(0)}</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">계정 설정</h1>
              <p className="text-slate-500 mt-1">프로필 및 보안 설정을 관리하세요.</p>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 flex items-start gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-relaxed">{error}</p>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 text-green-700 flex items-start gap-3 border border-green-100 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-relaxed">{success}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Form */}
          <section className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-50 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800">프로필 정보</h2>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="p-6 md:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 relative">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">사용자명</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow bg-slate-50/50 hover:bg-white focus:bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none bg-slate-100/80 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 ml-1">이메일은 변경할 수 없습니다.</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 mt-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4">비밀번호 변경</h3>
                <div className="space-y-4">
                  <div className="space-y-2 relative">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">현재 비밀번호</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="변경하지 않을 경우 비워두세요"
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow bg-slate-50/50 hover:bg-white focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 relative">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">새 비밀번호</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="새 비밀번호"
                          className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow bg-slate-50/50 hover:bg-white focus:bg-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 relative">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">비밀번호 확인</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="새 비밀번호 확인"
                          className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow bg-slate-50/50 hover:bg-white focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-500/25 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </section>

          {/* Danger Zone */}
          <section className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-red-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-red-50 bg-red-50/30 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-600">위험 구역</h2>
            </div>
            <div className="p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">계정 삭제</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-md leading-relaxed">
                  계정을 삭제하면 되돌릴 수 없습니다. 신중하게 결정해주세요. 작성한 게시글은 남아 있지만 탈퇴한 사용자로 표시됩니다.
                </p>
              </div>
              <button
                onClick={handleDeleteAccount}
                className="shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <Trash2 className="w-4 h-4" />
                계정 삭제
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Profile;
