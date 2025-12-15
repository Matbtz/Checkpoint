import LoginMethods from '@/components/auth/login-methods';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12 sm:px-6 lg:px-8">
      <LoginMethods />
    </div>
  );
}
