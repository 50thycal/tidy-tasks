'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold mb-3">App crashed</h1>
          <p className="opacity-80 mb-6">{String(error)}</p>
          <button className="btn btn-primary" onClick={() => reset()}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
