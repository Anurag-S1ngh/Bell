# Bell Quick Start

```sh
docker compose up -d postgres falkordb
bun install
bun run env:generate
bun run db:migrate
bun run dev
```

`FALKORDB_URL` (e.g. `falkordb://localhost:6379`) and `DATABASE_URL` are required in
`apps/server/.env`; startup fails if they are unset.

Web: <http://localhost:3001> · API: <http://localhost:3000> · FalkorDB browser: <http://localhost:3002>
