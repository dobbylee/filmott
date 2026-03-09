import React from 'react';
import { Outlet, Link } from 'react-router-dom';

const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-50/50 blur-3xl"></div>
        <div className="absolute top-[20%] right-[5%] w-[30%] h-[30%] rounded-full bg-slate-100/50 blur-3xl"></div>
      </div>

      {/* Header (Mostly visible on Login page, but we keep it generic or page-specific) */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-20 hidden md:flex">
        <Link to="/" className="flex items-center gap-2 text-slate-900 font-bold text-xl hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="PostBoard Logo" className="w-11 h-11" />
          <span>PostBoard</span>
        </Link>
        <Link to="/" className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors">
          ← 게시판 둘러보기
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center items-center p-4 z-10 w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default AuthLayout;
