'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  const isDatabaseError = error.message?.includes("P2022") || error.message?.includes("column");

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 p-4 text-center">
      <h2 className="text-xl font-bold">Something went wrong!</h2>
      <p className="text-muted-foreground max-w-md">
        {isDatabaseError
          ? "A database schema update is missing. Please ask an administrator to check database migrations."
          : error.message || "An unexpected error occurred."}
      </p>
      {isDatabaseError && (
        <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
             {error.message.slice(0, 100)}...
        </p>
      )}
      <div className="flex gap-4">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => router.push('/login')}>
          Go to Login
        </Button>
      </div>
    </div>
  );
}
