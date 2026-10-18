# Bell

Bell is a team knowledge graph: ingest docs, chats, tickets, and decisions into a temporal graph, then answer questions with grounded citations. No citation? It says so instead of guessing.

## Demo video

[![Bell hackathon submission — 2:30 product demo with real app recording](https://drive.google.com/thumbnail?id=16-YZgmmrIwgh5xvlj0nmCje9fR87Ilir&sz=w1280)](https://drive.google.com/file/d/16-YZgmmrIwgh5xvlj0nmCje9fR87Ilir/view?usp=sharing)

_2:30 · 1920×1080 — problem, connectors (Slack + 700+ via Nango), real Ask → cited-answer recording, architecture with FalkorDB at the center, and SDK usage.
[Watch on Google Drive](https://drive.google.com/file/d/16-YZgmmrIwgh5xvlj0nmCje9fR87Ilir/view?usp=sharing)_

## Quick start

New here? Follow [QUICKSTART.md](QUICKSTART.md). It takes ~5 minutes with Docker.

```sh
docker compose up -d postgres falkordb
bun install
bun run env:generate
bun run db:migrate
bun run dev
bun run --cwd apps/server seed:demo
```

Then open `http://localhost:3001` and ask: **"Who owns the search service, and how does it work?"** Expand the citations — that's the whole product.

| Service | URL |
| --- | --- |
| Web UI | `http://localhost:3001` |
| API | `http://localhost:3000` (`GET /api/health`) |
| FalkorDB browser | `http://localhost:3002` |
| Postgres | `localhost:5432` (user `bell`, db `bell`) |
| FalkorDB protocol | `falkordb://localhost:6379` |

## What it does

- `POST /api/ingest` — store an episode, extract entities/facts, mirror to FalkorDB. Dedupes on `(group_id, source_type, source_id)`.
- `POST /api/search` — hybrid retrieval: keyword, semantic, graph traversal, PageRank, temporal.
- `POST /api/answer` — grounded answer with `C1…` citations (quote + confidence), plus separate `inference` and `missing` lists.
- `GET /api/graph?groupId=default` — nodes/links for visualization, public + currently valid only.

```sh
# Ingest
curl -X POST http://localhost:3000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"content":"The search team owns keyword search. Owner: Bob Kumar.","sourceType":"doc","sourceId":"try-001"}'

# Ask
curl -X POST http://localhost:3000/api/answer \
  -H 'Content-Type: application/json' \
  -d '{"question":"Who owns the search service, and how does it work?"}'
```

## Workspace

- `apps/web` — Next.js frontend (`AskTab`, port `3001`)
- `apps/server` — Express API (port `3000`, `seed-demo.ts`, `backfill-falkor.ts`)
- `packages/db` — Drizzle schema + migrations (Postgres + pgvector, 1536-dim embeddings)
- `packages/graph` — FalkorDB client (`Entity` nodes, `FACT` edges, Cypher via `GRAPH.QUERY`)
- `packages/knowledge` — ingestion, extraction, search, answers
- `packages/ui` — shared UI components
- `packages/config` — shared TypeScript config

Postgres is the system of record. FalkorDB is a best-effort mirrored projection (`graphSynced` flag per ingest; `sync:graph` repairs drift).

## Environment

Schemas live at `apps/server/.env.schema`, `apps/web/.env.schema`, `packages/db/.env.schema`. After changing one, run `bun run env:generate`. Never commit `.env` files.

Minimum `apps/server/.env`:

```sh
DATABASE_URL=postgresql://bell:bell@localhost:5432/bell
FALKORDB_URL=falkordb://localhost:6379
BELL_GROUP_ID=default
PORT=3000
CORS_ORIGIN=http://localhost:3001
```

LLM keys are optional but recommended. With none set, answers fall back to extractive quotes (works, just verbose). With one set, you get full synthesis:

```sh
OPENAI_API_KEY=...        # or ANTHROPIC_API_KEY / GEMINI_API_KEY
# Optional: OPENAI_BASE_URL, LLM_MODEL, EMBEDDING_MODEL, BELL_AUTH_TOKEN
```

`apps/web/.env`:

```sh
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

## Scripts

- `bun run dev` — all apps in dev mode (Turbo)
- `bun run build` / `bun run check-types` — build / typecheck everything
- `bun run db:migrate` — run migrations (`db:push`, `db:generate`, `db:studio` also exist)
- `bun run --cwd apps/server seed:demo` — load 6 demo docs (idempotent)
- `bun run --cwd apps/server sync:graph` — re-mirror Postgres → FalkorDB
- `bun run env:generate` — regenerate typed env modules
- `bun run check` — oxlint + oxfmt

## Constraints

- No references to legacy projects or identifiers anywhere in the codebase.
- FalkorDB is the primary graph database; graph traversal depends on it.
- All new code follows `apps/web/AGENTS.md` and Drizzle conventions.

## Troubleshooting

Stuck? `QUICKSTART.md` has the fix-it list (ports in use, cold start, missing keys, reset). The short version: `docker compose ps`, `curl localhost:3000/api/health`, re-run `seed:demo`.
