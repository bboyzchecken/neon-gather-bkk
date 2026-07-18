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

### D0.6 Top-down rendering for Phase 0 (iso-ready)
Phaser world renders **top-down** on a square grid — far simpler than isometric depth
sorting for an MVP. The locked Art & Grid constants (tile 128×64, plot 4×4=512×256,
avatar ~110px) live in `shared-types` and are honoured, so isometric art can drop in
later without changing gameplay/coordinate logic.

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

### D0.12 Env loading
Single root `.env` (committed dev defaults). The Go API loads `./.env` then `../../.env`
via godotenv + Viper `AutomaticEnv`; Docker services get env from compose. Global TZ is
`Asia/Bangkok` per the template.
