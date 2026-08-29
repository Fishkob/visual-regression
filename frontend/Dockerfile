FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

RUN pnpm install --frozen-lockfile

COPY frontend/ ./frontend/
COPY client-sdk/ ./client-sdk/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter frontend run build

FROM nginx:alpine

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