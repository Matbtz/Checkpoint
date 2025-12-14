'use client';

import LoginForm from '@/components/auth/login-form';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <LoginForm />

        <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="bg-gray-50 dark:bg-gray-900 px-2 text-gray-500">
                    Or continue with
                </span>
            </div>
        </div>

        <button
          onClick={() => signIn('steam', { callbackUrl: '/' })}
          className="flex w-full items-center justify-center gap-3 rounded-md bg-[#171a21] px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171a21]"
        >
             <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11.979 0C5.678 0 .511 5.166.021 11.488l3.966 5.86c.667-1.391 2.086-2.35 3.729-2.35.26 0 .515.025.764.07l2.883-4.22a5.57 5.57 0 0 1-.368-1.992c0-3.097 2.51-5.607 5.607-5.607 3.097 0 5.607 2.51 5.607 5.607s-2.51 5.607-5.607 5.607c-2.07 0-3.869-1.119-4.87-2.786l-4.426 1.494a5.275 5.275 0 0 1-2.32 3.837L.344 24c2.812 3.193 6.941 5.23 11.635 5.23C18.595 29.23 24 23.825 24 17.209 24 10.595 18.595 5.19 11.979 5.19zM16.6 20.377a3.17 3.17 0 1 1 0-6.339 3.17 3.17 0 0 1 0 6.339zm-8.84-2.835a1.868 1.868 0 1 1 0-3.737 1.868 1.868 0 0 1 0 3.737zm10.749-3.414c-.93 0-1.685.755-1.685 1.685 0 .93.755 1.685 1.685 1.685.93 0 1.685-.755 1.685-1.685 0-.93-.755-1.685-1.685-1.685z" transform="scale(.82) translate(3,3)"/>
             </svg>
            Sign in with Steam
        </button>
      </div>
    </div>
  );
}
