import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Photos are uploaded to a route handler as multipart form data, which Next
  // streams without a body-size cap; the 25 MB per-file limit is enforced in
  // src/app/api/posts/route.ts.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
