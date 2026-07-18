# Neon Gather BKK — Phase 1 (Community Depth)

Cozy multiplayer community-mall web game. Phase 0 proved the core loop
(**register → rent a plot → order at the bar → trade on the marketplace** with
realtime avatar sync); Phase 1 adds the community layer: **jobs & skill trees,
quests (main/job/daily/weekly/community), a player job board with tips & reviews,
vending machines, a photo booth with a shareable album, and a visible
AutoServeBot that walks the floor (grid A*)**.

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
├─ .env                 local env — copy from .env.example (gitignored: holds real keys)
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
pnpm api:dev           # Go API on :5001 (auto-migrates on start; 5000 is taken by macOS AirPlay)
# terminal 2:
pnpm dev               # web on :3000 + game on :5173
```

Or one shot for setup: `pnpm setup` (install → infra up → wait → migrate + seed).

Then open **http://localhost:3000**.

### Option B — everything in containers (one command)

```bash
docker compose --profile apps up -d --build
```

Brings up PostgreSQL, Redis, MinIO **and** the Go API (:5001 on host), web (:3000), game (:5173).
The API container auto-migrates and seeds on boot.

### Ports

| Service | URL |
|---|---|
| Web shell | http://localhost:3000 |
| Game | http://localhost:5173 |
| API | http://localhost:5001 |
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

## Testing the Phase 2 features (so far)

1. **Coasters** — order at any shop table: STANDARD coaster on first order,
   OPENING_NIGHT during the shop's first 7 days, REGULAR at 20 orders of the
   same menu. View them at the 🪙 display cabinet in-game ([E]) or in **/album**,
   where you can also **Trade** them; listings appear in the dashboard's
   Coaster market.
2. **Cheers** — stand next to another player and press **[C]**: the server
   verifies you are both really there. Partners + counts show on the dashboard.
3. **Mall layout** — shop units now line the walls, wall-to-wall, flanking the
   entrance; the hall is fully enclosed (interior direction).

## Testing the Phase 1 features

1. **Jobs & quests** — everything you already do grants XP: creating items
   (CRAFTER), vendor sales (VENDOR), marketplace trades / renting (MERCHANT),
   collecting tables (HOST), photos & vending buys (EXPLORER). Watch levels and
   claim quest rewards on the **Dashboard**; the in-game **quest tracker** card
   (top-right, toggle with **Q**) shows live progress.
2. **Vending machine** — walk to the `V-01` machine near the bar, press **E**,
   then **1-4** to buy: coins go to the owner, the item drops into your inventory,
   the owner gets a low-stock alert at ≤2 left.
3. **Photo booth** — walk to the 📸 booth (south-east), press **E**, pick a
   backdrop with **1-3**, **SPACE** to shoot. The shot lands in **/album** with a
   public share link (`/p/<token>`).
4. **Job board** — rent a plot, open **/jobs**, post a position (wage per table
   collected). Another player applies, you hire them; they get order alerts for
   your plot and earn the wage each time they collect a table there. Tip and
   review them from the same page (players ↔ players: tips/reviews only — hearts
   are reserved for Phase 2 story NPCs).
5. **Community quest** — "Avenue Rush": all players' table orders count toward a
   server-wide weekly goal; contribute at least once and claim when it completes.

### Via curl (API only)

```bash
API=http://localhost:5001
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
| GET | `/ws?token=…` | WebSocket: avatar sync + table/vending broadcasts + personal alerts |

### Phase 1 additions

| Method | Path | Notes |
|---|---|---|
| GET | `/jobs/mine` · `/jobs/tree` | 5 jobs, XP/levels, unlocked perks, full skill tree |
| GET | `/quests` · POST `/quests/:id/claim` | merged defs + my progress per current period |
| GET/POST | `/staff/postings` (+ `/:id/close` `/:id/apply` `/:id/applications`) | job board |
| GET | `/staff/employments/mine` | my gigs |
| POST | `/staff/employments/:id/hire` \| `/end` \| `/tip` \| `/review` | tips/reviews only (iron rule) |
| GET | `/staff/:staff_id/reviews` | public review list |
| GET | `/vending` · POST `/vending/slots/:slot_id/buy` \| `/restock` | guarded stock, zero-sum coins |
| POST | `/photos` · GET `/photos/mine` · DELETE `/photos/:id` | booth uploads (moderation stub) |
| GET | `/share/photos/:token` | public share (no auth, unguessable token) |

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

## Art assets

The generated "Bangkok Urban Cozy" asset set (32 images) lives in
`apps/game/public/assets/` (+ icon copies in `apps/web/public/assets/icons/`):
facades, tables, bar counter, tropical plants, floor textures, item icons, UI sheets,
and the Phase 1 additions — vending machine, photo booth, quest-card UI reference,
plus `concepts/char_avatar_concept_01.png` (avatar lineup for real-artist handoff).

- Style is anchored by `_STYLE_REF_day.png` / `_STYLE_REF_night.png` (approved concepts).
- Regenerate with `node scripts/gen-assets.mjs` (needs `BFL_API_KEY` in `.env`;
  `--force` re-gens all, `--only <name>` targets one). Prompts + request ids are
  logged to `ASSET_PROMPTS_LOG.md`.
- Every file follows the locked naming convention, so hand-made art can replace any
  image drop-in without code changes.

**Offline preview:** if the API isn't running, the game boots into a demo world
(seed-like plots/tables, no networking) so you can always check art in-game with
just `pnpm --filter @neon/game dev`.

## Tests

- Go business logic: `cd apps/api && go test ./...` — wallet money math (no overdraw,
  zero-sum trades), Phase 1 XP/level curve + perk unlocks, quest period keys
  (daily/weekly reset boundaries).
- Type safety: `pnpm typecheck` across web + game.
