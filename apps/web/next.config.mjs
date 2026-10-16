/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared contract package ships TypeScript source.
  transpilePackages: ["@recallai/shared-types"],
  env: {
    // Set NEXT_PUBLIC_API_URL to point the same UI at the Express backend.
    // Leave empty to run against the in-memory mock transport.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
};

export default nextConfig;