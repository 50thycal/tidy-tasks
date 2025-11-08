import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="max-w-lg mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-3">Page not found</h1>
      <p className="opacity-80 mb-6">The page you're looking for doesn't exist.</p>
      <Link className="btn btn-primary" href="/">
        Back to Home
      </Link>
    </main>
  );
}
