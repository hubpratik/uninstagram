import type { NextConfig } from "next";

/**
 * Build config for the container image only. Copied over the dev next.config.ts
 * inside the Docker build; your local file is untouched.
 */
const nextConfig: NextConfig = {
  // Pin the tracing root to the build directory. Without this, Next walks up
  // looking for a workspace root, and if it finds a package.json in a parent it
  // nests the output as .next/standalone/<subdir>/server.js — which would leave
  // the Dockerfile's `CMD ["node", "server.js"]` pointing at nothing. Verified:
  // reproduced the nesting, then confirmed this line fixes it.
  outputFileTracingRoot: process.cwd(),

  // Emits .next/standalone: a self-contained server with only the node_modules
  // it actually traced. Cuts the image from ~500 MB to roughly 150-200 MB,
  // which is also what keeps scale-from-zero cold starts short.
  output: "standalone",

  // Keep sharp as a runtime require rather than letting the bundler near its
  // native bindings.
  serverExternalPackages: ["sharp"],

  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
