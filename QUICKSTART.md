# Bell Quick Start

Get from zero to a grounded answer in ~5 minutes.

## 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) running (`docker --version`, `docker compose version`)
- [Bun](https://bun.sh) 1.4+ (`bun --version`)
- One LLM key **(recommended, optional)**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`. Without one, Bell still works — answers fall back to extractive quotes.

## 2. Start infrastructure

```sh
docker compose up -d postgres falkordb
docker compose ps   # both should be healthy
```

This gives you Postgres on `5432` (user `bell`, password `bell`, db `bell`) and FalkorDB on `6379` + browser on `3002`.

## 3. Install and configure

```sh
bun install
bun run env:generate
```

Create `apps/server/.env` (startup fails without the first two):

```sh
DATABASE_URL=postgresql://bell:bell@localhost:5432/bell
FALKORDB_URL=falkordb://localhost:6379
BELL_GROUP_ID=default
PORT=3000
CORS_ORIGIN=http://localhost:3001
# Pick one (recommended):
OPENAI_API_KEY=...
# Optional: OPENAI_BASE_URL, LLM_MODEL, EMBEDDING_MODEL, BELL_AUTH_TOKEN
```

Create `apps/web/.env`:

```sh
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

## 4. Migrate and run

```sh
bun run db:migrate
bun run dev
```

Wait for `FALKOR_INITIALIZED` and `Server is running on http://localhost:3000` in the server logs. Then check:

```sh
curl http://localhost:3000/api/health
# {"status":"ok","service":"bell"}
```

| Service | URL |
| --- | --- |
| Web | `http://localhost:3001` |
| API | `http://localhost:3000` |
| FalkorDB browser | `http://localhost:3002` |

## 5. Load the demo

In a second terminal (dev servers keep running):

```sh
bun run --cwd apps/server seed:demo
```

Expected output — 6 docs, each `graph:synced`, plus node/link totals:

```
demo-seed-team: entities +2/0 facts +2 graph:synced
...
graph totals: N nodes, M links
```

Re-running is safe: fixed `sourceId`s dedupe instead of duplicating. If `BELL_AUTH_TOKEN` is set, export it first (`API_URL` defaults to `http://localhost:3000`).

## 6. Ask something

Open `http://localhost:3001` and ask:

> **Who owns the search service, and how does it work?**

You should get an answer citing the roster + ADR-003 (Bob Kumar leads the search team, which owns keyword search via BM25 + LLM rerank). Expand **Citations** to see the quotes. Or via curl:

```sh
curl -X POST http://localhost:3000/api/answer \
  -H 'Content-Type: application/json' \
  -d '{"question":"Who owns the search service, and how does it work?"}'
```

Try the follow-up: *"What did we decide about the graph database?"* — it should cite ADR-001 (FalkorDB chosen) + ADR-004 (RedisGraph retired).

No grounded evidence? Bell returns `"I do not have accessible evidence..."` with `confidence: 0`. That's the feature, not a bug.

## 7. Fix-it list

- **Server exits on boot** — `DATABASE_URL` / `FALKORDB_URL` missing or wrong. Check `apps/server/.env`, then `docker compose ps`.
- **Ports in use** — `3000` (API), `3001` (web), `5432`, `6379`, `3002`. Stop the other process or change the mapping.
- **Empty / weird answers** — no LLM key set means extractive fallback. Add a key, restart `bun run dev`.
- **Graph looks stale** — Postgres is truth, FalkorDB is a mirror. Repair with:
  ```sh
  bun run --cwd apps/server sync:graph
  ```
- **Start over** — `docker compose down -v` wipes `pgdata`/`falkordata`. Then repeat from step 4.
- **Auth errors** — if `BELL_AUTH_TOKEN` is set server-side, send `Authorization: Bearer <token>` on `/api/*` (except `/api/health`).

Next: `README.md` for the API reference, `blog-post.md` for the architecture walkthrough.
