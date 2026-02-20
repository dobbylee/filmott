import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layers } from 'lucide-react';

const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-50/50 blur-3xl"></div>
        <div className="absolute top-[20%] right-[5%] w-[30%] h-[30%] rounded-full bg-slate-100/50 blur-3xl"></div>
      </div>

      {/* Header (Mostly visible on Login page, but we keep it generic or page-specific) */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 hidden md:flex">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-xl">
          <Layers className="text-blue-500 w-8 h-8 fill-blue-500" />
          <span>Learning Board</span>
        </div>
        <a href="#" className="text-sm text-slate-500 hover:text-slate-800 font-medium">
          Need help?
        </a>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center items-center p-4 z-10 w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default AuthLayout;
