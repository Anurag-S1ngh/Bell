# Bell

Bell is a team knowledge graph: ingest docs, chats, tickets, and decisions into a
temporal graph, then answer questions with grounded citations.

## Demo video

[![Bell hackathon submission — 2:30 product demo with real app recording](https://drive.google.com/thumbnail?id=16-YZgmmrIwgh5xvlj0nmCje9fR87Ilir&sz=w1280)](https://drive.google.com/file/d/16-YZgmmrIwgh5xvlj0nmCje9fR87Ilir/view?usp=sharing)

_2:30 · 1920×1080 — problem, connectors (Slack + 700+ via Nango), real Ask →
cited-answer recording, architecture with FalkorDB at the center, and SDK usage.
[Watch on Google Drive](https://drive.google.com/file/d/16-YZgmmrIwgh5xvlj0nmCje9fR87Ilir/view?usp=sharing)_

## Quick start

Full setup (Docker, environment, database, dev servers): see
[QUICKSTART.md](QUICKSTART.md).

```sh
bun install
bun run dev
```

Web UI: `http://localhost:3001` · API: `http://localhost:3000`

## Workspace

- `apps/web` — Next.js frontend
- `apps/server` — Express API
- `packages/db` — Drizzle schema + migrations (Postgres + pgvector)
- `packages/graph` — FalkorDB graph client (primary graph store)
- `packages/knowledge` — ingestion, extraction, search, answers
- `packages/ui` — shared UI components
- `packages/config` — shared TypeScript config

## Environment

See `apps/*/.env.schema` and `packages/db/.env.schema`. Run
`bun run env:generate` after changes. Do not commit `.env` files.

## Constraints

- No references to legacy projects or identifiers anywhere in the codebase.
- FalkorDB is the primary graph database; graph traversal depends on it.
- All new code follows `apps/web/AGENTS.md` and Drizzle conventions.

## Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:studio`: Open database studio
- `bun run db:generate`: Generate Drizzle migrations
- `bun run db:migrate`: Run migrations
- `bun run env:generate`: Regenerate typed env modules
- `bun run check`: Run oxlint and oxfmt
