FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder

WORKDIR /app

COPY package.json ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@').pop()")" && npm install -g "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

RUN pnpm install --frozen-lockfile

COPY frontend/ ./frontend/
COPY client-sdk/ ./client-sdk/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter frontend run build

FROM nginx:1.31.9-alpine@sha256:fb4658584bd9a916ffb6f6e365f97c25cfdb2923801f551ea08356e695f14ff7

RUN apk upgrade --no-cache

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /var/cache/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d /var/cache/nginx && \
    sed -i '/^pid /d' /etc/nginx/nginx.conf

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off; pid /tmp/nginx.pid;"]