import type { NextConfig } from "next";
import { serverActionOrigins } from "./src/app/_shared/allowed-origins";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // CSRF guard for Server Actions: Origin must match Host (or this list); behind a proxy that rewrites Host,
    // BETTER_AUTH_URL names the public one.
    serverActions: { allowedOrigins: serverActionOrigins(process.env.BETTER_AUTH_URL) },
  },
};

export default nextConfig;
