# Evidentia governance console — reference image (see docs/OPERATIONS.md)
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY governance ./governance
COPY evals ./evals
COPY demo ./demo
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile --filter @evidentia/core --filter @evidentia/cli --filter @evidentia/admin

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 EVIDENTIA_DB=/data/evidentia.db EVIDENTIA_SIGNING_KEY=/data/signing-key.json EVIDENTIA_PUBLISH_DIR=/data/published
COPY --from=base /app /app
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/admin/src/server.ts"]
