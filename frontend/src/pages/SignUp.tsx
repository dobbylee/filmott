import React from 'react';
import { User, Mail, EyeOff, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';

const SignUp: React.FC = () => {
  return (
    <div className="w-full max-w-md flex flex-col items-center">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full p-8 md:p-10 border-b-[6px] border-b-blue-200/50">
        {/* Header Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-blue-500 p-3 rounded-xl shadow-md shadow-blue-500/20">
            <GraduationCap className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1.5">Join the Board</h1>
          <p className="text-slate-500 text-sm">
            Start your learning journey today.
          </p>
        </div>

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 tracking-wide block" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <input
                id="username"
                type="text"
                placeholder="Choose a username"
                className="block w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 tracking-wide block" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                className="block w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Password & Confirm */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 tracking-wide block" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="block w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow tracking-widest"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 tracking-wide block" htmlFor="confirm">
                Confirm
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  className="block w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow tracking-widest"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Checkbox */}
          <div className="flex items-start mt-4 mb-6 pt-2">
            <div className="flex items-center h-5">
              <input
                id="terms"
                type="checkbox"
                className="w-4 h-4 text-blue-500 bg-white border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
              />
            </div>
            <div className="ml-2.5 text-xs text-slate-600">
              <label htmlFor="terms" className="font-medium">
                I agree to the {' '}
                <a href="#" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="font-bold text-blue-500 hover:text-blue-600 hover:underline">Privacy Policy</a>.
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm shadow-blue-500/30 text-sm font-bold text-white bg-[color:var(--color-primary-500)] hover:bg-[color:var(--color-primary-600)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors mt-2"
          >
            Create Account
          </button>
        </form>

        {/* Footer Link */}
        <p className="mt-8 text-center text-sm text-slate-500 font-medium">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-500 hover:text-blue-600 font-bold tracking-wide">
            Log in
          </Link>
        </p>
      </div>

      <div className="mt-10 text-[11px] font-medium text-slate-400">
        © 2024 Learning Board. All rights reserved.
      </div>
    </div>
  );
};

export default SignUp;
