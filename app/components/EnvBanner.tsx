import 'server-only';

export default async function EnvBanner() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  if (hasKey) return null;

  const isProd =
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production';
  const where = isProd
    ? 'Vercel Project → Settings → Environment Variables'
    : '.env.local';

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm px-4 py-2 text-center">
      <strong>OpenAI key missing.</strong> Add <code>OPENAI_API_KEY</code> in{' '}
      {where}, then redeploy.
    </div>
  );
}
