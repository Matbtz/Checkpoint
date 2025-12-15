import Link from 'next/link';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { auth } from '@/auth';

export default async function Navbar() {
  const session = await auth();

  return (
    <nav className="bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                Checkpoint
              </Link>
            </div>
            {session && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-700"
                >
                  Dashboard
                </Link>
                <Link
                  href="/import"
                  className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-700"
                >
                  Import
                </Link>
              </div>
            )}
          </div>
          {/* Desktop Right Side */}
          <div className="hidden sm:ml-6 sm:flex sm:items-center gap-4">
             {session ? (
                 <>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {session.user?.name || session.user?.email}
                    </span>
                    <SignOutButton />
                 </>
             ) : (
                 <Link
                    href="/login"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                 >
                     Sign In
                 </Link>
             )}
          </div>

          {/* Mobile Right Side - Simplified */}
          <div className="flex items-center sm:hidden gap-4">
             {session ? (
                 <>
                    <Link
                      href="/dashboard"
                       className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Dash
                    </Link>
                    <SignOutButton />
                 </>
             ) : (
                 <Link
                    href="/login"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                 >
                     Sign In
                 </Link>
             )}
          </div>
        </div>
      </div>
    </nav>
  );
}
