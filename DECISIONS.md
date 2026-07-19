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

### D1.8 Phase 1 asset generation (see also D2.3)
Same BFL FLUX Kontext pipeline (D0.12b) extended with `prop_vending_01`,
`prop_photobooth_01`, `ui_quest_card_01` (F3 reference) and
`char_avatar_concept_01` (E1 concept for real-artist handoff, per §0.3 art
scheduling). The white→alpha post-process now also flood-fills desaturated light greys
from the borders because FLUX kept baking soft ground shadows despite the negative
prompt (violating the no-baked-shadow rule); raw outputs are kept in `.asset-raw/` so
post-processing can be re-tuned without re-billing.

---

## Phase 2 — Bar Social Layer & Collectibles (in progress)

### D2.1 Interior art direction (explicit product decision, 2026-07-18)
Direction from the owner: the world must feel like the INSIDE of one building, not
shop-after-shop on an open plaza. Implemented in `WorldScene.drawInteriorShell()`:
full-height back walls (gy=0 / gx=0) with columns, teal windows and a warm glass
entrance; low cutaway walls with teak cap rails on the two front edges; string-light
arcs; a warm dim + vignette overlay; concrete hall floor with a terracotta walkway
cross. Walls are drawn procedurally (Graphics), not generated sprites — exact 2:1
grid alignment beats AI-generated wall art, and the shell stays compatible with the
D0.6 night-mode overlay plan. Future zones/floors must stay enclosed the same way.

### D2.2 Coasters (Phase 2 §1) — first slice shipped
`coasters` has UNIQUE (shop, tier, season); `player_coasters` has UNIQUE
(player, coaster) so duplicate grants are impossible at the DB level. Issuance only
happens server-side when a player ORDERS at a shop's table ("you were there"):
STANDARD once per shop, plus OPENING_NIGHT while server time is inside the 7-day
window from `plot.rented_at` (pure fn `domain/coasterrules.IsOpeningNight`, tested —
the window never reopens). Per-shop season cap is config (`COASTER_SEASON`,
`COASTER_SEASON_CAP`, default 500 — not hardcoded), enforced under a row lock on the
coaster. Owners upload a 256×256 design through the same moderation stub as facades.
Seed tables are now linked round-robin to plots so shop-scoped systems (coasters,
staff wages, order alerts) work out of the box.
**Deferred within §1:** marketplace trading of coasters and placing the display
cabinet (`prop_cabinet_01`) in the world — next slice, before §2 (regular status).

### D2.3 Phase 2 asset batch
Same BFL pipeline: `coaster_blank_01` (D1 template shown for STANDARD),
`coaster_opening_01` (D2 shown for OPENING_NIGHT), `prop_cabinet_01` (B6).
`copyToWeb` now mirrors an asset's own directory into `apps/web/public/assets/<dir>/`.

### D2.4 Mall layout: shop units line the walls (product direction, 2026-07-19)
Follow-up direction: shops must sit "ร้านต่อร้าน กำแพงต่อกำแพง" — adjacent units
along the building walls like a real mall corridor, not free-standing islands.
Implemented as data + rendering together: the seeder's `mallLayout` places four
4×4 units flush against the top wall flanking the entrance and two on the left
wall (adjacent units share boundary lines), with an idempotent `relayoutPlots`
step so layout changes reach already-seeded databases by plot code. The game
draws procedural party walls (120px, teak base, green trim) on each unit's side
edges — back 2.5 tiles only, keeping storefronts open — and facades widened to
3.4 tiles so the row reads continuous.

### D2.5 Coaster trading + display cabinet (§1 complete)
Trading rides the marketplace rails: `player_coasters` gained
`listed_for_sale`/`price`; list/unlist are owner-guarded updates, buying is a
guarded transfer inside a transaction with zero-sum `MARKET_BUY`/`MARKET_SELL`
ledger entries. The UNIQUE (player, coaster) index doubles as the "no duplicate
ownership" rule — buying a design you already own fails cleanly. The B6 display
cabinet is placed in the food-court zone; [E] opens the in-game collection
gallery, and the web album lists/unlists coasters for trade.

### D2.6 Bar social §2: regulars + cheers
`regular_statuses` UNIQUE (player, shop, menu) counts successful orders of the
same order_name at the same shop; hitting the configured threshold
(`REGULAR_THRESHOLD`, default 20) EXACTLY once sets `achieved_at` and grants the
shop's REGULAR-tier coaster. `cheers_logs` stores canonically-ordered pairs
(UNIQUE) with first_cheers_at + total_count. Iron rule enforced structurally:
`POST /cheers` verifies BOTH players are connected to the live WS hub and within
2.5 tiles using the server's own position state (`Hub.Position`) — offline, far,
self and NPC targets are all impossible, and the client can't fake presence.
Pure rules live in `domain/social` with tests. Cheers awards a small EXPLORER XP
to both sides and feeds a new daily quest.

### D2.7 Chill-lounge ambience + §4 adaptation (2026-07-19)
Direction: the interior must feel relaxing, not cramped. Ambient dim/vignette
halved, windows on both back walls doubled (every other bay), a skylight
light-well pools daylight over a new lounge courtyard (BFL-generated sofa
group + flat teal rug + gachapon). §4's fishing tie-in is gone with fishing
(D0.8), but its intent survives: an `idle` service scans the LIVE hub
positions once a minute and awards a small EXPLORER XP tick to players
relaxing in the bar zone (server state only — unfakeable), with the in-game
hint pointing idle players at the job board. fx gotcha recorded: lifecycle
services must appear in ServerParams or fx never constructs them.

### D2.8 §3 passport + §5 slice (gachapon, bartender stories)
TastingStamp UNIQUE(player, menu) on every successful order; the passport
target is COUNT(DISTINCT name) of DRINK/FOOD items so the book grows with
player content. Gachapon is a coin sink (config GACHA_PRICE) that grants a
random open shop's SEASONAL coaster — feeding §1; duplicates refund 10c.
Bartender stories: 8 seeded wholesome tales (2 late-night-only by server
clock), 35% roll per order, collectible log in the album.
**Deferred from §5:** darts/dice/cards, claw machine visual, per-shop arcade
leaderboard, and the jukebox (upload+moderation+rights-confirmation surface
— needs its own careful slice).

### D2.9 §6 heart system + §7 iron-rule tests
First character: Nara (bartender, adult, shift 18→02 wrapping midnight,
signature Iced Thai Tea, home shop A-01). Iron rules are enforced
structurally and TESTED:
- (a) `player_affinities.staff_id` carries a real FK onto `staff_npcs` —
  `TestAffinityCannotTargetRealPlayers` runs against live Postgres and
  proves an affinity row pointing at a user id is REJECTED by the DB.
- (b) no real-money conversion: `TestNoRealMoneyHeartRoutes` scans the real
  route table; the only NPC actions are talk/tip/gift.
- (e) every NPC DTO carries `is_npc: true`; game + web render an explicit
  ☆ badge.
- (f) points/last_talked_at are server-computed; the daily-talk guard is a
  SQL predicate, not client state.
- (g) StaffStoryNode carries RefusalText — characters can decline.
Earning: gifts strongest (LOVED 25 … DISLIKED 1) > daily talk 8 > signature
order 4 > tip 3 > passive presence 1/min (idle ticker). 10-level track
seeded; Lv3 grants her CHAR-NARA coaster, Lv5 mints the secret-recipe item.
Lv6 cosmetic / Lv8 visit event / Lv10 heart_special portrait deliver their
story text now — their tangible payloads land with the decor system and the
guest artist's final art (concept sheet generated for handoff; AI art is
concept-only for characters per the asset library rule).

---

## Phase 3 — Scale & World Expansion (in progress)

### D3.1 Multi-floor building: one floor rendered at a time
Every placeable (Plot, DiningTable, VendingMachine) and every live position
(ws.Player, move messages, clamped server-side 1..3) carries `floor`. The client
renders ONE floor per scene and switches by restarting WorldScene with a floor
param — plots/tables/vending/players are filtered by floor, and same-floor is
now part of the server's cheers presence check. Themes: G = bar + food court
(everything from Phases 0-2 stays here, incl. Nara/bot/booth/gacha), 2 =
Boutique Row (teak level, shop units B-01..B-04), 3 = Rooftop Garden (parapet
walls, open sky, dense festoons, lounge, tables T-05/T-06). Elevator + stairs
sit at fixed spots on every floor and open the same 1-2-3 travel panel — the
seeder adds floor-2/3 content by code so existing DBs upgrade in place. The
idle-XP bar zone is explicitly floor-1.

### D3.2 Day/night cycle per the D0.6 architecture
Phase (day 06-17, dusk 17-19, night otherwise; `?tod=` dev override) drives:
camera background = sky over the parapets/walls, a screen-space tint layer
(blue-green at night, warm at dusk) on top of the cozy dim, and the emissive
accents — wall windows flip from teal glass to warm glow, string-light bulbs
brighten, the entrance light spill widens. A 60s ticker restarts the scene when
the phase flips. One asset set only (iron rule from §0.1): all of this is
overlay + recolour, no second day/night art set.

### D3.3 Community festival + deferred monetization
The Phase 3 "server-wide event" ships as a festival set of COMMUNITY quests
(Maker Market, Memory Wall — one goal per craft, alongside Avenue Rush).
Battle pass / cosmetic monetization is deliberately NOT built: it needs product
pricing decisions and a real user base first (matches the plan's own risk
notes). Multi-floor per-floor themes beyond three floors are schema-ready
(floor int, no cap in data — server clamps 1..3 for now).

### D3.4 Seenspace-reference night hall (2026-07-19)
Owner supplied Seenspace Thonglor photos as the interior/night reference. The
G-floor now matches it: dining relaid as a BEER GARDEN — eight long communal
tables (new light-oak + black-steel asset) in two rows, laid out by code so
existing DBs move too; a cluster of woven rattan pendants (new asset) hangs
over the rows and the lounge, adding warm additive light pools after dark;
open shops get additive neon accents above their signs at night (shapes only,
no lettering — art rule) plus a warm storefront spill; the lounge courtyard
sits on a black-and-white checkered floor; large interior ficus trees (new
asset) break up the hall like Seenspace's atrium. Rooftop keeps round tables.
