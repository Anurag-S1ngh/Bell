FROM oven/bun:1.1 AS builder
WORKDIR /app
COPY package.json bun.lock tsconfig.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN bun install --frozen-lockfile
ENV NEXT_PUBLIC_SERVER_URL=http://localhost:3000
RUN bun run build -F web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder /app/apps/web/public apps/web/public
EXPOSE 3001
CMD ["node", "apps/web/server.js"]