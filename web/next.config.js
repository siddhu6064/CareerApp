/** @type {import('next').NextConfig} */
//
// Phase 10.5: when APPNAME_BUILD_TARGET=desktop, build a fully static export
// that Tauri can load from disk via tauri://localhost. SSR + dynamic params
// are unsupported in static-export mode, so [id] / [token] routes need the
// `generateStaticParams` shim provided in each page (see app/jobs/[id], etc).
const isDesktop = process.env.APPNAME_BUILD_TARGET === "desktop";

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  // SaaS deployment: SSR on Vercel as before. Desktop: static export.
  ...(isDesktop && {
    output: "export",
    images: { unoptimized: true },
    // Trailing slashes make file-system URLs (.../jobs/abc/index.html) work
    // when served by tauri://localhost.
    trailingSlash: true,
  }),
};
module.exports = nextConfig;
