FROM oven/bun:1.1 AS builder
WORKDIR /app
COPY package.json bun.lock tsconfig.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1.1 AS runner
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "bun run db:migrate && exec bun apps/server/dist/index.mjs"]