# syntax=docker/dockerfile:1.7
# ---- build the static site -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=optional
COPY . .
RUN npm run build

# ---- runtime dependencies: the server needs only `pg` (everything else is bundled into dist/) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev --ignore-scripts --no-audit --no-fund pg@8 && npm cache clean --force

# ---- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 DIST_DIR=/app/dist
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY db ./db
COPY scripts ./scripts
COPY package.json ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.js"]
