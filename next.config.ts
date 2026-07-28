import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Partial Prerendering + `use cache`. Dictionary data is immutable and shared,
  // so it belongs in the static shell; per-user data streams behind <Suspense>.
  cacheComponents: true,
};

export default nextConfig;
