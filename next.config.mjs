/** @type {import('next').NextConfig} */
const nextConfig = {
  // The .eslintrc "next/core-web-vitals" config fails to resolve under
  // Vercel's production build environment (works locally with bun but
  // Vercel's build path picks up a different lookup and errors out). Since
  // ESLint is already run as its own CI job via `next lint`, skip it
  // during `next build` so the Vercel deploy is not blocked on a lint issue.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
