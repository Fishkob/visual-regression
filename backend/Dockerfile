FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@').pop()")" && npm install -g "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml .npmrc ./
COPY pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma/
COPY backend/tsconfig.json backend/tsconfig.node.json ./backend/
COPY backend/src ./backend/src/

RUN pnpm install --frozen-lockfile

WORKDIR /app/backend
RUN pnpm exec prisma generate
RUN pnpm run build

FROM node:26-alpine AS production

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@').pop()")" && npm install -g "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml .npmrc ./
COPY pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
RUN node -e "const fs=require('fs');['package.json','backend/package.json'].forEach(f=>{const p=JSON.parse(fs.readFileSync(f,'utf8'));delete p.scripts.prepare;fs.writeFileSync(f,JSON.stringify(p,null,2))})" && pnpm install --frozen-lockfile --prod

RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/lib/node_modules/pnpm \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma/schema.prisma ./backend/prisma/schema.prisma
COPY --from=builder /app/backend/prisma/migrations ./backend/prisma/migrations
COPY backend/prisma.config.ts ./backend/prisma.config.ts

ENV NODE_ENV=production

RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

CMD ["node", "backend/dist/src/main.js"]