import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

// Content-Security-Policy.
//   - HLS media + the ingest host must be allowed, else the browser blocks
//     playlist/segment fetches and playback. connect-src covers hls.js XHR/fetch
//     of .m3u8/.ts; media-src covers the <video> element. https: is broad on
//     purpose (feeds may come from any configured ingest host — tighten to your
//     specific host(s) in production).
//   - DEV ONLY: Next.js dev mode (Turbopack / React RSC dev client) uses eval()
//     for HMR and debug callstacks, so 'unsafe-eval' is added in development.
//     Production never uses eval(), so the production policy stays strict.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'"

const cspValue = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https: http:",
  "connect-src 'self' https: http: ws: wss:",
  "font-src 'self' data:",
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'Content-Security-Policy', value: cspValue }],
      },
    ]
  },
}

export default nextConfig
