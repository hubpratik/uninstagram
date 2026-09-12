# syntax=docker/dockerfile:1
#
# Production image for Azure Container Apps.
#
# Build from the PROJECT ROOT, not from this folder:
#   docker build -f container_deployment/Dockerfile -t uninstagram .
#
# Nothing in the dev tree is modified. The Azure storage drivers live in
# container_deployment/overlay/ and are copied over the source inside the image
# only, so `npm run dev` on your machine keeps using the local JSON + disk
# drivers exactly as before.

# ---------------------------------------------------------------- dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./

# npm ci runs on Linux here, so it resolves @img/sharp-linux-x64 rather than the
# win32 binary sitting in your local node_modules. This is the whole reason the
# container path is safer than deploying a folder built on Windows.
RUN npm ci

# Added at image-build time so package.json in the dev tree stays untouched.
RUN npm install --no-save @azure/storage-blob@12.33.0 @azure/data-tables@13.3.2

# ---------------------------------------------------------------------- build
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Layer the Azure drivers and the standalone build config over the source.
COPY container_deployment/overlay/ ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Drop the sharp variants this image can never use: it is glibc linux/amd64, so
# the musl builds and the wasm fallback are ~28 MB of dead weight. This has to
# happen HERE, before the runner copies them — deleting after a COPY leaves the
# bytes in the earlier layer and the image does not shrink at all.
RUN rm -rf node_modules/@img/sharp-linuxmusl-x64            node_modules/@img/sharp-libvips-linuxmusl-x64            node_modules/@img/sharp-wasm32

# --------------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The non-root user has no home directory, so fontconfig cannot write its cache
# and logs a warning on every image operation. Pointing it at /tmp keeps the
# logs clean — which is not just tidiness: Container Apps bills log ingestion.
ENV XDG_CACHE_HOME=/tmp

# The watermark is SVG text rendered by sharp, and node:*-slim images ship NO
# fonts at all. Without these the mark comes out as tofu boxes on every uploaded
# photo. Found by building without them and looking at the result.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

# Run as a non-root user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# output: "standalone" emits a self-contained server plus only the node_modules
# it actually traced.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# sharp ships native .node binaries that dependency tracing has historically
# missed. Copying them explicitly costs a few MB and removes the risk entirely.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img


# In Azure mode nothing is written to disk — photos and records go to Blob and
# Table Storage. This directory exists purely so the image can also be run in
# local-JSON mode for a smoke test; without it the non-root user cannot mkdir
# under /app and uploads fail with EACCES. Its contents are ephemeral either way.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data  && chown -R nextjs:nodejs /var/cache/fontconfig

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
