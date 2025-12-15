import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Game Library Manager
          </h1>

          {session ? (
              <div className="space-y-4">
                  <p className="text-lg text-zinc-600 dark:text-zinc-400">
                      Welcome back, {session.user?.name || session.user?.email}
                  </p>
                   <div className="flex gap-4">
                      <Link
                          href="/dashboard"
                          className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      >
                          Go to Dashboard
                      </Link>
                      <Link
                          href="/import"
                          className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-zinc-900 dark:text-white dark:ring-zinc-700 dark:hover:bg-zinc-800"
                      >
                          Import Steam Games
                      </Link>
                   </div>
              </div>
          ) : (
             <div className="space-y-4">
                 <p className="text-lg text-zinc-600 dark:text-zinc-400">
                     Login to manage your game collection.
                 </p>
                 <div className="flex gap-4">
                    <Link
                        href="/login"
                        className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        Sign In
                    </Link>
                     <Link
                        href="/register"
                        className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                        Register
                    </Link>
                 </div>
             </div>
          )}

        </div>

        <div className="mt-10">
            <h2 className="text-xl font-bold mb-4">Project Status</h2>
            <ul className="list-disc pl-5 space-y-2">
                <li>Authentication (Email/Password & Steam) - Implemented</li>
                <li>Database Schema - Updated</li>
                <li>Steam Import Service - Implemented</li>
                <li>Import Interface - Implemented</li>
            </ul>
        </div>
      </main>
    </div>
  );
}
