# Build with apps as context: docker build -f deploy/Dockerfile ... .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.ts tsconfig.json ./
COPY client ./client
COPY shared ./shared
COPY public ./public
RUN npm run build

FROM node:24-alpine AS api
ENV NODE_ENV=production HOST=0.0.0.0 API_PORT=8787 WEB_PORT=443
ENV PROVIDERS_ENV=/run/secrets/providers
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir .data && chown node:node .data
COPY server ./server
COPY shared ./shared
# Existing server modules use this pure helper at runtime.
COPY client/staff/rooms.ts ./client/staff/rooms.ts
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health', {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/main.ts"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
