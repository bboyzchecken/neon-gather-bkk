# Neon Gather BKK — Phase 0 (MVP Core Loop)

Cozy multiplayer community-mall web game. Phase 0 proves the core loop:
**register → rent a plot → order at the bar → trade on the marketplace**, with
realtime avatar sync and an AutoServeBot-driven table order/serve/collect flow.

> Backend follows the Go REST template in `../PROJECT_TEMPLATE.md`
> (Echo + GORM + Uber FX). See [DECISIONS.md](DECISIONS.md) for the full rationale.

---

## Stack

| Layer | Tech |
|---|---|
| Game client | Phaser 3 + Vite + TypeScript (top-down, 2.5D-ready grid) |
| Web shell | Next.js 14 (App Router) + React |
| API | **Go 1.23** · Echo · GORM · Uber FX · gormigrate · Viper · Logrus · validator |
| Database | **PostgreSQL 16** |
| Cache / leaderboard | Redis (sorted sets) |
| Object storage | MinIO (dev) / Cloudflare R2 (prod) via AWS SDK v2 |
| Realtime | native WebSocket (gorilla/websocket) |
| Auth | JWT (HS256) + opaque refresh tokens |
| Monorepo | Turborepo + pnpm (frontend) · Go module (api) |

## Monorepo layout

```
neon-gather-bkk/
├─ apps/
│  ├─ api/     Go REST + WebSocket server (pkg/{core,db,cache,models,store,services,handlers,ws,domain})
│  ├─ web/     Next.js shell (login, register, dashboard, /play iframe)
│  └─ game/    Phaser game (world, plots, tables)
├─ packages/
│  └─ shared-types/   TS wire contracts for web + game (mirrors the Go JSON)
├─ docker-compose.yml   infra (postgres, redis, minio) + optional full app stack
├─ .env                 dev defaults (committed; local only)
└─ turbo.json / pnpm-workspace.yaml
```

---

## Prerequisites

- Node.js ≥ 20 and **pnpm 11** (`npm i -g pnpm`)
- **Go 1.23+**
- Docker Desktop (for PostgreSQL / Redis / MinIO)

---

## Quick start

### Option A — dev (recommended): infra in Docker, apps on host

```bash
pnpm install
pnpm infra:up          # starts PostgreSQL + Redis + MinIO (+ bucket init)
pnpm api:seed          # migrate + seed mock data
# terminal 1:
pnpm api:dev           # Go API on :5000 (auto-migrates on start)
# terminal 2:
pnpm dev               # web on :3000 + game on :5173
```

Or one shot for setup: `pnpm setup` (install → infra up → wait → migrate + seed).

Then open **http://localhost:3000**.

### Option B — everything in containers (one command)

```bash
docker compose --profile apps up -d --build
```

Brings up PostgreSQL, Redis, MinIO **and** the Go API (:5000), web (:3000), game (:5173).
The API container auto-migrates and seeds on boot.

### Ports

| Service | URL |
|---|---|
| Web shell | http://localhost:3000 |
| Game | http://localhost:5173 |
| API | http://localhost:5000 |
| MinIO console | http://localhost:9001 (neon_minio / neon_minio_pw) |
| PostgreSQL | localhost:5432 · Redis | localhost:6379 |

### Seeded accounts

- Demo player: `demo@neon.gg` / `demo1234` (pre-filled on the login page)
- Marketplace is pre-stocked by an "Avenue Market" seller so you can buy immediately.

---

## Testing the full Phase 0 flow

### In the browser
1. http://localhost:3000 → **Log in** (demo account pre-filled) or **Play as guest**.
2. **Enter the Avenue** → move with WASD/arrows.
3. Click a blue (vacant) plot → **rent** it (coins deducted, turns green).
4. Walk to a **table**, press **E** to order → the AutoServeBot serves after a few
   seconds → press **E** again to collect.
5. Open the **Dashboard** to buy from the marketplace, list your items for sale,
   or vendor-sell them; sales feed the weekly earnings leaderboard.
6. Open a second browser (or the guest mode) to see avatars sync in realtime.

### Via curl (API only)

```bash
API=http://localhost:5000
# guest login
TOKEN=$(curl -s -X POST $API/auth/guest | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
auth="Authorization: Bearer $TOKEN"

curl -s $API/users/me -H "$auth"                       # wallet (250 guest coins)
PLOT=$(curl -s $API/plots -H "$auth" | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST $API/plots/$PLOT/rent -H "$auth"       # rent (-200)
curl -s $API/marketplace -H "$auth"                    # browse seeded listings
ITEM=$(curl -s $API/marketplace -H "$auth" | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST $API/marketplace/$ITEM/buy -H "$auth"  # buy it (zero-sum transfer)
curl -s -X POST $API/items/$ITEM/vendor-sell -H "$auth" # vendor-sell it back
curl -s $API/leaderboard/earnings -H "$auth"
```

---

## API surface (Phase 0)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` \| `/login` \| `/guest` \| `/refresh` \| `/logout` | JWT + refresh |
| GET | `/users/me` | current profile + coins |
| GET | `/plots` · POST `/plots/:id/rent` | rent = atomic claim + ledger debit |
| PATCH | `/plots/:id/facade` · POST `/plots/:id/facade/texture` | template + upload (moderation stub) |
| GET | `/items/mine` · POST `/items` · POST `/items/:id/vendor-sell` | inventory |
| GET | `/marketplace` · POST `/marketplace/:id/list` \| `/unlist` \| `/buy` | zero-sum trade |
| GET | `/tables` · POST `/tables/:id/order` \| `/collect` | AutoServeBot lifecycle |
| GET | `/leaderboard/earnings` | Redis weekly top 10 sellers |
| GET | `/ws?token=…` | WebSocket: avatar sync + table broadcasts |

---

## Useful scripts

```bash
pnpm dev            # web + game (Turbo)
pnpm api:dev        # Go API (go run)
pnpm api:test       # Go unit tests (wallet money math)
pnpm api:build      # compile Go binary → apps/api/bin/api
pnpm build          # build web + game + shared-types
pnpm infra:up/down  # docker infra
pnpm stack:up/down  # full docker stack (profile: apps)
```

## Tests

- Go business logic: `cd apps/api && go test ./...` (wallet money math: no overdraw, zero-sum trades).
- Type safety: `pnpm typecheck` across web + game.
