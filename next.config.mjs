import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // Disable the service worker in `next dev` so we don't have to fight a
  // stale SW cache during development. Production builds (`next build` →
  // `next start`) include the SW and full offline support.
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Use the default Workbox runtime config: app-shell precached at build
  // time, NetworkFirst for navigations and same-origin requests, with a
  // sensible cache cap. API routes (/api/*) are NetworkOnly via the
  // default rules — our /lib/api-client.ts handles offline fallbacks
  // explicitly via Dexie, which is what makes optimistic writes possible.
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    // Don't precache the giant build manifests in dev sourcemaps.
    exclude: [/\.map$/, /^manifest.*\.js$/],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // User progress changes frequently — don't serve stale RSC payloads
    // from the client-side router cache when navigating between levels.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default withPWA(nextConfig);
