import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Home, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Home className="text-blue-500" />
            <span>Dashboard</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.username}!</h1>
              <p className="text-slate-500">{user?.email}</p>
            </div>
          </div>
          <p className="text-slate-600">
            You have successfully set up the frontend and backend authentication flow. Let's build the Board CRUD next!
          </p>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
