/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow API routing to FastAPI backend during dev — clients use NEXT_PUBLIC_API_URL directly.
  reactStrictMode: true,
  experimental: { typedRoutes: false },
};
module.exports = nextConfig;
