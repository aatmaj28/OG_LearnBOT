/** @type {import('next').NextConfig} */

// STATIC_EXPORT=1 (npm run build:static): plain static files in out/ that the FastAPI backend serves at /.
// The legacy app's route handlers (app/api/**/route.ts) can't be exported, so in that build only .tsx/.jsx
// files count as app files; route.ts handlers are left out. `next dev` / `next build` are unchanged.
const staticExport = process.env.STATIC_EXPORT === '1'

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  ...(staticExport ? { output: 'export', trailingSlash: true, pageExtensions: ['tsx', 'jsx'] } : {}),
}

export default nextConfig
