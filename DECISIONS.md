# Decision Log — Neon Gather BKK

Chronological record of significant library/pattern choices. Newest phase last.

---

## Phase 0 — MVP Core Loop

### D0.1 Backend = Go REST template (replaces the initial NestJS scaffold)
The first Phase 0 pass used NestJS. Per direction, it was **removed entirely** and
rebuilt in Go following `PROJECT_TEMPLATE.md`:
Echo (v4) · GORM · Uber FX (DI) · gormigrate · Viper + godotenv · Logrus ·
go-playground/validator · JWT HS256 · golang.org/x/crypto (bcrypt) · google/uuid.
Layered + repository pattern: `handlers → store interfaces (models) → GORM`.

### D0.2 Database = PostgreSQL 16 (deviation from the template's MySQL)
The template standardises on MySQL, but PostgreSQL was chosen by explicit product
decision (better fit for the game's transactional economy and later analytics).
Everything else about the data layer follows the template: GORM + repository stores,
migrations on startup via **gormigrate** (`AutoMigrate` of all models); the binary
also supports `./api up` (migrate only) and `./api seed` (migrate + seed).
Driver: `gorm.io/driver/postgres` (pgx).

### D0.3 Redis + MinIO kept alongside the template
The template lists Redis as optional and uses S3/R2 storage. Phase 0 needs both:
- **Redis** for the weekly fishing leaderboard (sorted sets, `ZINCRBY`/`ZREVRANGE`).
- **MinIO** (dev) / **Cloudflare R2** (prod) for player facade-texture uploads, via
  AWS SDK v2 with `UsePathStyle` + a static endpoint.

### D0.4 Realtime = native WebSocket (gorilla/websocket), not Socket.io
The template is REST-only. Avatar position sync + table-state broadcasts use a small
in-process hub (`pkg/ws`). The game client uses the browser's native `WebSocket`
(no socket.io dependency). Auth is passed as `?token=` on the handshake because
browsers can't set headers on WS upgrades.

### D0.5 JSON is snake_case
Per the template convention. The Go structs carry snake_case json tags; `@neon/shared-types`
mirrors those exact shapes so web + game stay in sync with one source of truth.

### D0.6 Isometric 2:1 rendering (revised — was briefly top-down)
The first pass rendered top-down for simplicity, but with iso-styled assets on a flat
grid the scene read as "flat 2D", contradicting the approved reference art. Reworked to
true **isometric 2:1 projection** per the locked Art & Grid Standards (tile 128×64):
- `isoPos(gx,gy)` grid→screen mapping in `apps/game/src/config.ts`; world logic stays
  in grid coordinates (floats), including WebSocket position sync.
- Flat floor textures are turned into 128×64 diamond tiles at runtime (RenderTexture:
  rotate 45° then squash Y ×0.5) and blitted into one static ground RenderTexture.
- Depth sorting by screen Y for facades/props/avatars; plots use polygon (diamond)
  hit areas; WASD stays screen-aligned via screen→grid direction conversion.
- Game loop uses `forceSetTimeOut` + auto-wake on document-hidden so the multiplayer
  world keeps stepping in background tabs (RAF freezes on hidden tabs).

### D0.7 Money safety: append-only ledger + row locks + atomic claims
All coin movement goes through `WalletStore.ApplyDelta`, which reads the balance
`FOR UPDATE`, refuses to go negative (`domain/wallet.NextBalance`), and writes one
`LedgerEntry` per movement. Rent and marketplace buys use guarded `UPDATE … WHERE`
claims (`ClaimVacant` / `ClaimForSale`) inside a transaction so two racers can't both
win, and settlement is exactly zero-sum. Pure math is unit-tested without a DB.

### D0.8 Fishing system removed from scope (docs are reference-only)
The fishing minigame described in the planning docs was cut from the project by
explicit product decision — those documents remain as reference material only.
All fishing code (species/catch models, weighted-roll domain logic, cast endpoint,
pier + timing-bar scene) was removed. Consequences:
- The weekly Redis leaderboard was **repurposed to "earnings"** (coins earned from
  vendor sales + marketplace sales) so the Phase 0 leaderboard feature survives with
  a real data source (`lb:earnings:weekly:*`, endpoint `/leaderboard/earnings`).
- Item rarity remains as a generic marketplace concept (rarity UI frames are part of
  the locked asset system) even though nothing assigns rarity in Phase 0.
- Ledger type `FISH_SELL` became `VENDOR_SELL`.

### D0.9 Table server named `AutoServeBot` (never "NPC")
The order→serve→collect worker (`pkg/services/autoserve`) is deliberately **not**
called NPC, to avoid colliding with the distinct, named `StaffNPC` heart-system concept
arriving in Phase 2. Table model is `DiningTable`.

### D0.10 Content-moderation stub from day one
Facade-texture upload is a player-upload surface, so it ships with a moderation stub
(`pkg/services/moderation`): validates MIME type + size and marks uploads
`PENDING_REVIEW`. Real moderation (Rekognition/Vision) is deferred to Phase 4 per the
iron rules.

### D0.11 Frontend package manager & DI
pnpm + Turborepo for web/game/shared-types. `shared-types` builds to CJS `dist` and is
consumed by both apps (Next `transpilePackages`, Vite native). The Go API is outside the
JS workspace and is driven by `pnpm api:*` scripts / Docker.

### D0.12b Asset pipeline: BFL FLUX Kontext + white→alpha post-process
Phase 0 art is generated via the BFL API (`scripts/gen-assets.mjs`): FLUX Kontext Pro
with `_STYLE_REF_day.png` as the style reference for every asset (per the library's
"always attach the style ref" rule), prompts composed from the locked Style DNA +
per-type tech specs. Because image models can't output true alpha, world sprites are
generated on pure white and post-processed in `sharp` (border flood-fill → alpha +
bounding-box crop). Floors are opaque seamless tiles; icons are downscaled to 512px
per the spec. The game renders these iso sprites on the Phase 0 top-down grid (works
visually; full iso projection comes later). The game also gained an **offline preview
mode** (demo plots/tables, no sockets) so art can be checked without infra running.
Renderer switched to `Phaser.CANVAS` — reliable canvas snapshots (needed for the
Phase 1 photo booth) at this scale.

### D0.12 Env loading
Single root `.env` (committed dev defaults). The Go API loads `./.env` then `../../.env`
via godotenv + Viper `AutomaticEnv`; Docker services get env from compose. Global TZ is
`Asia/Bangkok` per the template.

---

## Phase 1 — Community Depth

### D1.1 Job list adapted to live systems (spec deviation)
The brief lists Fisher/Farmer/Crafter/Merchant/Explorer, but fishing was removed from
scope (D0.8) and no farming system exists. Phase 1 ships five jobs that all have real
XP sources today: **VENDOR** (vendor sales, vending machines), **MERCHANT**
(marketplace trades, plot rent), **CRAFTER** (item creation), **HOST** (table
collection, staff shifts, tips), **EXPLORER** (photo booth, table orders, vending
buys). Enum strings live in `models/enums.go`; renames are cheap if product wants the
original names back.

### D1.2 Progress events: one server-side entry point
`services/progress.Fire(playerID, event)` is the only path that awards job XP and
advances quests (personal + community). Handlers fire events AFTER their own economy
transaction commits; progress runs in its own transaction and never breaks the calling
flow (iron rule §9 — nothing about XP/progress comes from the client). XP curve, perk
tree and period-key math are pure domain packages (`domain/progression`,
`domain/questperiod`) with unit tests.

### D1.3 Quest periods via composite unique key
`player_quests` has UNIQUE (player_id, quest_id, period_key) where period_key is `-`
(MAIN/JOB), `2026-07-18` (DAILY) or `2026-W29` (WEEKLY/COMMUNITY, ISO week, server TZ
Asia/Bangkok). Daily/weekly resets are therefore row-creation, not row-mutation — no
cron needed and double-claims are impossible at the DB level (iron rule §10). Claim is
a guarded `UPDATE … WHERE status='COMPLETED'`. Community quests accumulate in a
separate `community_progresses` row per (quest, period); a player must have contributed
≥1 event that period to claim once the server-wide goal is met.

### D1.4 Job board wage model: per-table-collected
The brief allows wage/revenue-share; Phase 1 implements **wage per table collected on
the employer's plot** (`JobPosting.WagePerTask`) because collection is the one staff
action the server can already verify. Wage transfer owner→staff is zero-sum through the
ledger (`WAGE_PAY`/`WAGE_RECEIVE`) and silently skipped if the owner can't cover it.
Tips (`TIP_PAY`/`TIP_RECEIVE`) and 1-5★ reviews (UNIQUE (employment, rater)) are the
only player↔player relations — no heart/affection accumulator exists on any
player-linked table (iron rule; hearts arrive in Phase 2 bound to StaffNPC only).

### D1.5 Vending machines mint items, coins stay zero-sum
Slots are product templates (name/thumb/price/stock); buying decrements stock with a
guarded `UPDATE … WHERE stock > 0`, moves coins buyer→owner zero-sum, and mints a fresh
Item row for the buyer — consistent with Phase 0's free-mint `CreateItem`. Restock is
capped in SQL (`stock + add <= cap`), base cap 10, raised by VENDOR "Stockmaster" perks.
Low stock (≤2) pushes a WS `vending_low_stock` alert to the owner.

### D1.6 AutoServeBot: server state, client walking
Table state remains fully server-authoritative (the Phase 0 ticker). Phase 1 adds a
**visual** AutoServeBot in the game client: a dependency-free 4-dir grid A*
(`src/pathfind.ts`, plots are blocked tiles) walks the bot to ORDERED tables (serve)
and COLLECTED tables (clean), then home. No gameplay depends on the bot's position, so
client-side animation can't desync the economy. easystar.js was skipped — the world is
24×24 and the A* is ~70 lines.

### D1.7 Photo booth: canvas snapshot + share tokens
The Phaser CANVAS renderer (chosen in D0.12b for this feature) snapshots a region
around the booth (`renderer.snapshotArea`), uploads it as multipart PNG through the
moderation stub to MinIO/R2, and stores a `Photo` row with `photo_type`
('BOOTH' | 'HEART_SPECIAL' — the latter reserved per the brief for Phase 2) and an
unguessable UUID `share_token`. The public page `/p/[token]` (and API
`GET /share/photos/:token`) needs no auth; the album page manages/deletes own photos.

### D1.9 .env is NOT committed after all (supersedes part of D0.12)
D0.12 described the root `.env` as "committed dev defaults", but the leftover
template-oss root `.gitignore` (ignore-everything) had silently kept it untracked —
and by Phase 1 it holds a real paid `BFL_API_KEY`, so committing it to a GitHub-remote
repo would leak the key. Resolution: `.env` stays local and gitignored; the committed
contract is **`.env.example`** (dev defaults + `BFL_API_KEY` placeholder). The same
cleanup replaced the template-oss `.gitignore`, restored the template-mangled root
`package.json`/`.npmrc`, and moved `@npmcli/template-oss` artifacts
(`.commitlintrc.js`, `.eslintrc.js`, `.github/` npm workflows) out of the repo.

### D1.8 Phase 1 asset generation
Same BFL FLUX Kontext pipeline (D0.12b) extended with `prop_vending_01`,
`prop_photobooth_01`, `ui_quest_card_01` (F3 reference) and
`char_avatar_concept_01` (E1 concept for real-artist handoff, per §0.3 art
scheduling). The white→alpha post-process now also flood-fills desaturated light greys
from the borders because FLUX kept baking soft ground shadows despite the negative
prompt (violating the no-baked-shadow rule); raw outputs are kept in `.asset-raw/` so
post-processing can be re-tuned without re-billing.
