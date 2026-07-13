# myAgent — cloud image for Northflank (or any Docker host). Runs the whole
# platform (app + admin) in one container on $PORT (default 8787); set
# ADMIN_MOUNT=path so the Operations console rides the same port at
# /atlas-operations. All persistent state lives in Postgres (DATABASE_URL) —
# the container filesystem is disposable.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY web/package*.json web/
RUN npm ci --prefix web
COPY . .
RUN npm run build --prefix web && rm -rf web/node_modules web/src

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8787 8788
# container-level probe; Northflank's own health check hits /healthz over HTTP
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:${PORT:-8787}/healthz || exit 1
CMD ["node", "server/index.js"]
