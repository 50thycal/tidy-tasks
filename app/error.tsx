'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="max-w-lg mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-3">Something went wrong</h1>
      <p className="opacity-80 mb-6">{error.message ?? 'Unexpected error.'}</p>
      <div className="flex gap-3 justify-center">
        <button className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link className="btn btn-muted" href="/">
          Go Home
        </Link>
      </div>
    </main>
  );
}
