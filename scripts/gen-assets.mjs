// Asset generation pipeline (Phase 0 + Phase 1) — BFL FLUX API.
//
//   node scripts/gen-assets.mjs --anchor     gen the style-anchor scene -> _STYLE_REF_day.png
//   node scripts/gen-assets.mjs              gen all manifest assets (skips existing files)
//   node scripts/gen-assets.mjs --force      re-gen everything
//   node scripts/gen-assets.mjs --only key   gen a single asset by key
//
// Reads BFL_API_KEY from the root .env. Style locked: "Bangkok Urban Cozy"
// (see asset-prompt-library.md §1). Every asset call uses FLUX Kontext with
// _STYLE_REF_day.png as the style reference so the set stays consistent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_ASSETS = path.join(ROOT, 'apps', 'game', 'public', 'assets');
const WEB_ICONS = path.join(ROOT, 'apps', 'web', 'public', 'assets', 'icons');
const REF_PATH = path.join(ROOT, '_STYLE_REF_day.png');
// second anchor for the D3.5 open-neighbourhood set (owner-approved look:
// exposed black steel frame, planter-lined walkways, golden-hour warmth)
const SOI_REF_PATH = path.join(ROOT, '_STYLE_REF_soi.png');
const LOG_PATH = path.join(ROOT, 'ASSET_PROMPTS_LOG.md');

const API = 'https://api.bfl.ai';
const CONCURRENCY = 3;

// ---------------------------------------------------------------- env / api
function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/^BFL_API_KEY=(.+)$/m);
  if (!m) {
    console.error('BFL_API_KEY not found in .env');
    process.exit(1);
  }
  return m[1].trim();
}
const KEY = apiKey();

async function bflCreate(endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'x-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${endpoint} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function bflWait(task) {
  const pollUrl = task.polling_url ?? `${API}/v1/get_result?id=${task.id}`;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(pollUrl, { headers: { 'x-key': KEY } });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'Ready') {
      const url = data.result?.sample ?? data.result?.output;
      if (!url) throw new Error(`ready but no sample url: ${JSON.stringify(data)}`);
      return url;
    }
    if (['Error', 'Failed', 'Content Moderated', 'Request Moderated'].includes(data.status)) {
      throw new Error(`generation failed: ${data.status} ${JSON.stringify(data.details ?? '')}`);
    }
  }
  throw new Error('polling timed out');
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ------------------------------------------------------------- post-process
/** Remove the near-white background (flood fill from the borders) -> alpha.
 * Also treats low-saturation light greys as background so baked-in soft ground
 * shadows (which FLUX keeps adding despite the negative prompt) get eaten by
 * the border flood fill. Object interiors are protected by their dark outline. */
async function whiteToAlpha(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const TH = 233;
  const idx = (x, y) => (y * w + x) * 4;
  const nearWhite = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= TH && g >= TH && b >= TH) return true;
    // light grey / light warm-grey (soft shadow): bright-ish, low-to-mid
    // saturation. The object interior is protected by its dark outline, so a
    // generous threshold here only eats border-connected halo + shadow.
    const mn = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    return mn >= 165 && mx - mn <= 52;
  };
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = idx(x, y);
    if (!nearWhite(i)) continue;
    data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  defringeRaw(data, w, h);
  // opaque bounding box (with padding) so sprites have no wasted margins
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[idx(x, y) + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const pad = 6;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const width = Math.min(w, maxX + pad + 1) - left;
  const height = Math.min(h, maxY + pad + 1) - top;
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
}

/** Peel the 1-3px pale halo the flood fill leaves at anti-aliased sprite
 * edges (the "white seams" in-game). Bright low-saturation pixels touching
 * transparency are removed, a few rounds deep — dark outlines stop the peel
 * at the real silhouette. */
function defringeRaw(data, w, h) {
  const idx = (x, y) => (y * w + x) * 4;
  for (let round = 0; round < 3; round++) {
    const kill = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        if (data[i + 3] === 0) continue;
        const clearNext =
          (x > 0 && data[idx(x - 1, y) + 3] === 0) ||
          (x < w - 1 && data[idx(x + 1, y) + 3] === 0) ||
          (y > 0 && data[idx(x, y - 1) + 3] === 0) ||
          (y < h - 1 && data[idx(x, y + 1) + 3] === 0);
        if (!clearNext) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mn = Math.min(r, g, b);
        const mx = Math.max(r, g, b);
        if (mx >= 200 && mx - mn <= 60) kill.push(i);
      }
    }
    if (!kill.length) break;
    for (const i of kill) data[i + 3] = 0;
  }
}

/** Defringe an already-processed transparent PNG in place (for assets whose
 * raw output predates .asset-raw and can't be fully re-processed). */
async function defringeExisting(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  defringeRaw(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function postProcess(buf, asset) {
  let out = asset.alpha ? await whiteToAlpha(buf) : await sharp(buf).png().toBuffer();
  if (asset.size) {
    out = await sharp(out)
      .resize(asset.size, asset.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: asset.alpha ? 0 : 1 },
      })
      .png()
      .toBuffer();
  }
  return out;
}

// ------------------------------------------------------------------ prompts
const STYLE =
  'Clean isometric game art illustration with even-weight dark charcoal linework, flat colour ' +
  'fills with soft subtle shading, no heavy gradients. Warm Southeast Asian urban palette: ' +
  'terracotta clay, warm cream concrete, dark forest-green steel framing, teak wood, muted teal ' +
  'accents. Matte materials, warm natural daylight. Modern Bangkok community mall aesthetic. ' +
  'Cozy, calm, inviting. No readable text, no lettering, no signage copy, no watermark.';

const WORLD_TECH =
  'Single object only, centered, isometric three-quarter view, light from the upper-left, ' +
  'absolutely no shadow cast on the ground, no drop shadow, no grey shadow shape under or beside ' +
  'the object, no background scenery, no floor under the object — it sits on ' +
  'a solid pure white background, full object visible and not cropped.';

const ICON_TECH =
  'A single game item icon, centered, three-quarter view seen slightly from above, light from ' +
  'the upper-left, clear readable silhouette, on a solid pure white background, no other objects.';

const FLOOR_TECH =
  'Perfectly flat top-down view, seamless repeating tileable pattern filling the entire frame ' +
  'edge to edge, even flat lighting, no objects, no shadows, no border, no vignette.';

const ANCHOR_PROMPT =
  'Isometric view of a small three-story community mall on a quiet urban street corner. ' +
  'Ground floor: an open cafe with outdoor teak tables and chairs, and a vending machine near ' +
  'the entrance. Second floor: small boutique shops with glass storefronts and awnings. ' +
  'Rooftop: a garden terrace with string lights and benches. A blank billboard panel on the ' +
  'side wall. Tropical potted plants along the walkway. A few small stylized people walking, ' +
  'sitting and chatting. Clean readable composition. ' +
  STYLE;

// Matches the owner's approved reference (2026-07-19): Seenspace-style
// open-frame corner building, dense planters, golden-hour light.
const SOI_ANCHOR_PROMPT =
  'Isometric view of a modern two-story community mall on a Bangkok street corner at golden ' +
  'hour. Exposed dark charcoal steel frame structure with open-air upper terraces behind slim ' +
  'black metal railings, every terrace edge lined with terracotta pots of monstera, banana ' +
  'plants and ferns. A leafy green courtyard tree grows up through the central atrium. Warm ' +
  'cream concrete walls with terracotta accent panels and blank rectangular sign boards. ' +
  'Ground floor: an open cafe with wooden tables, a vending machine by the entrance, rows of ' +
  'terracotta planters along the sidewalk with small bollards at the kerb of a dark asphalt ' +
  'road. A few small stylized people strolling and sitting. Warm late-afternoon golden light ' +
  'washing over everything. Clean isometric game art illustration with even-weight dark ' +
  'charcoal linework, flat colour fills with soft subtle shading. Warm Southeast Asian urban ' +
  'palette. Cozy, calm, inviting. No readable text, no lettering, no watermark.';

// ------------------------------------------------------------ asset manifest
const A = (file, dir, desc, opts = {}) => ({
  file,
  dir,
  desc,
  aspect: opts.aspect ?? '1:1',
  alpha: opts.alpha ?? false,
  size: opts.size,
  copyToWeb: opts.copyToWeb ?? false,
  tech: opts.tech ?? WORLD_TECH,
  ref: opts.ref ?? 'day', // which style anchor to attach: 'day' | 'soi'
});

const ASSETS = [
  // A. facades (world sprites) — reworked 2026-07-19 on the soi anchor:
  // exposed black steel frames per the owner's open-frame reference
  A('env_facade_empty_01.png', 'world', 'an empty rentable shop unit: an exposed matte black steel post-and-beam frame with a warm cream concrete base, a closed roll-down metal shutter between the black posts, a blank rectangular sign panel mounted on the black beam above, a low concrete step, one potted monstera beside the doorway.', { alpha: true, ref: 'soi' }),
  A('env_facade_a_01.png', 'world', 'a small modern cafe storefront: an exposed matte black steel frame with floor-to-ceiling glass between the posts, a blank rectangular sign panel on the black beam above the door, a slim black-framed awning, two potted tropical plants flanking the entrance, warm interior light visible through the glass.', { alpha: true, ref: 'soi' }),
  A('env_facade_b_01.png', 'world', 'a small vintage shop storefront: an exposed matte black steel frame with a teak wood front infill, a blank hand-painted sign board hung on the black beam above, a striped fabric awning, wooden shutters folded open, a wooden crate and a fern in a terracotta pot beside the entrance.', { alpha: true, ref: 'soi' }),
  A('env_facade_c_01.png', 'world', 'a small Thai street-food stall: an exposed matte black steel frame with a stainless steel counter facing the walkway, a corrugated metal awning resting on the black frame, a blank menu board panel above, stacked plastic stools beside it, a banana plant in a terracotta pot at the corner.', { alpha: true, ref: 'soi' }),
  // B. furniture / props
  A('prop_table_round_01.png', 'world', 'a small round teak cafe table with two matching teak chairs.', { alpha: true }),
  A('prop_table_bar_01.png', 'world', 'a tall teak bar table with two wooden stools.', { alpha: true }),
  A('prop_counter_bar_01.png', 'world', 'a bar counter with a teak wood top and terracotta tiled base, three stools lined up in front, a back shelf unit behind it filled with rows of bottles and hanging glassware, a small potted plant at one end.', { alpha: true, aspect: '16:9' }),
  A('prop_plant_monstera_01.png', 'world', 'a large monstera plant in a terracotta pot.', { alpha: true }),
  A('prop_plant_banana_01.png', 'world', 'a small banana plant in a terracotta pot.', { alpha: true }),
  A('prop_plant_fern_01.png', 'world', 'a lush boston fern in a terracotta pot.', { alpha: true }),
  // floors (opaque, tileable)
  A('env_floor_terracotta_01.png', 'floors', 'plain warm terracotta paver floor tiles only — absolutely no plants, no leaves, no pots, no objects, no shadows of any kind, just the bare paver pattern.', { tech: FLOOR_TECH, size: 512 }),
  A('env_floor_teak_01.png', 'floors', 'plain teak wood plank flooring only — absolutely no plants, no objects, no shadows, just the bare wood plank pattern.', { tech: FLOOR_TECH, size: 512 }),
  A('env_floor_concrete_01.png', 'floors', 'plain warm cream polished concrete floor with subtle panel joints only — absolutely no plants, no objects, no shadows, just the bare concrete surface.', { tech: FLOOR_TECH, size: 512 }),
  // C. item icons (also copied to the web dashboard)
  A('icon_drink_thai_tea.png', 'icons', 'a tall glass of Thai iced tea, bright orange with cream swirl on top and a straw.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_drink_coffee_iced.png', 'icons', 'a tall glass of iced black cold-brew coffee with ice cubes.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_drink_cocktail.png', 'icons', 'a cocktail in a coupe glass with a citrus garnish.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_drink_beer.png', 'icons', 'a glass of draft beer with a foamy head.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_drink_smoothie.png', 'icons', 'a fruit smoothie in a tall glass with a straw and a slice of mango on the rim.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_drink_teapot.png', 'icons', 'a small ceramic teapot in muted teal.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_food_noodles_padthai.png', 'icons', 'a plate of pad thai noodles with shrimp, lime wedge and bean sprouts.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_food_fried_rice.png', 'icons', 'a plate of fried rice with a fried egg on top.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_food_skewers.png', 'icons', 'three grilled meat skewers on a small plate.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_food_cake.png', 'icons', 'a slice of layered cake on a small plate with a fork.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_decor_stool_bar.png', 'icons', 'a teak wooden bar stool.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_decor_plant_monstera.png', 'icons', 'a small monstera plant in a terracotta pot.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  A('icon_material_basket_woven.png', 'icons', 'a handwoven rattan basket.', { alpha: true, size: 512, copyToWeb: true, tech: ICON_TECH }),
  // ---- Phase 1 additions ----
  // world objects (library B4/B5)
  A('prop_vending_01.png', 'world', 'a tall vending machine: warm cream body with terracotta accent panels and a dark forest-green frame, a large glass front showing neat rows of colorful drink bottles and cans, a blank panel at the top, a dispenser slot at the bottom, a small blank selection keypad.', { alpha: true }),
  A('prop_photobooth_01.png', 'world', 'a photo booth cabinet: warm cream body with a dark forest-green steel frame, a heavy teal curtain drawn to one side, a small teak bench visible inside, a camera lens module on the interior wall, a blank display panel on the outside, a potted fern beside it.', { alpha: true }),
  // quest tracker card reference (library F3)
  A('ui_quest_card_01.png', 'ui', 'a quest tracker UI card on a neutral background: a warm cream rounded card with a small icon slot on the left, three empty text placeholder bars, a checkbox column on the right, and a thin progress bar at the bottom. Soft shadow, dark forest-green outline. No readable text, use plain grey placeholder bars instead of letters.', { tech: 'Flat front-facing view, crisp and readable at small size.' }),
  // avatar concept lineup for real-artist handoff (library E1 — concept only, not production)
  A('char_avatar_concept_01.png', 'concepts', 'a character lineup on a plain neutral background: five young adult characters standing in a row — two women, two men, and one androgynous person — full body, front view, casual Southeast Asian streetwear: oversized shirts, skirts, tote bags, sneakers, caps. Clearly different body shapes (one plus-size, one tall and lanky, one petite), different skin tones from light to deep, and varied hairstyles including long hair, a bob cut, and curly hair. Simple readable silhouettes, relaxed friendly poses. Slightly stylized proportions, head slightly larger than realistic.', { aspect: '16:9', tech: 'Full-body character concept lineup, front view, evenly spaced, plain neutral background.' }),
  // ---- Phase 2 additions ----
  // display cabinet (library B6) — coaster showcase furniture
  A('prop_cabinet_01.png', 'world', 'a glass display cabinet with a dark forest-green steel frame and teak base, three empty glass shelves, warm interior lighting, standing upright against nothing.', { alpha: true }),
  // Phase 3b — Seenspace-style night hall (communal seating + hanging light)
  A('prop_table_communal_01.png', 'world', 'a long communal dining table with a light oak wood top and slim black steel legs, six black metal tolix-style stools tucked in around it, modern beer-garden style.', { alpha: true, aspect: '16:9' }),
  A('prop_lamp_rattan_01.png', 'world', 'a single round handwoven rattan pendant lamp hanging from a thin black cord, a warm glowing filament bulb visible inside, light passing through the weave.', { alpha: true }),
  A('prop_tree_interior_01.png', 'world', 'a large indoor ficus tree with a slender dark trunk and a lush layered green canopy, planted in a big round dark grey concrete planter.', { alpha: true }),
  // Phase 3 — vertical transport
  A('env_elevator_01.png', 'world', 'a compact interior elevator unit: dark forest-green metal double doors with a round brass floor-indicator dial above them, a warm cream surrounding frame with a teak base, and a small call-button panel beside the doors.', { alpha: true }),
  A('env_stairs_01.png', 'world', 'a straight interior staircase rising from lower-left to upper-right: teak wood steps, a dark forest-green steel railing with thin balusters, a warm cream stringer side panel.', { alpha: true }),
  // chill lounge set + §5 gachapon (same B-series material language)
  A('prop_sofa_01.png', 'world', 'a low cozy lounge sofa set: a two-seat sofa with warm cream cushions on a teak wood frame, one matching armchair beside it, and a small round teak coffee table with a tiny potted succulent on top, arranged as one corner group.', { alpha: true, aspect: '16:9' }),
  A('prop_rug_01.png', 'world', 'a large flat oval area rug viewed at the same isometric angle as the floor, muted teal with a thin terracotta border and a subtle woven texture, lying perfectly flat on the ground, nothing on top of it.', { alpha: true, aspect: '16:9' }),
  A('prop_gacha_01.png', 'world', 'a capsule toy vending machine (gachapon): a rounded glass globe on top filled with small colorful capsule balls, warm cream body with terracotta accents and a dark forest-green base, a big turning knob and a coin slot on the front, a small dispensing flap at the bottom.', { alpha: true }),
  // E2 concept for the first StaffNPC — real-artist handoff only, never production
  A('char_npc_bartender_concept_01.png', 'concepts', 'a character concept sheet on a plain neutral background: one young adult bartender character, full body front view, and the same character again in three-quarter view. Casual uniform with a dark forest-green apron over a warm cream shirt, sleeves rolled up, relaxed confident posture, warm friendly expression, distinct memorable silhouette.', { aspect: '16:9', tech: 'Character concept sheet, two poses of the same character, evenly spaced, plain neutral background.' }),
  // coasters (library D1/D2) — 256×256 collectibles, also served by the web app
  A('coaster_blank_01.png', 'coasters', 'a blank circular drink coaster viewed perfectly flat from directly above, plain warm cream surface with a thin dark border ring, subtle pressed paper texture, no design in the center.', { alpha: true, size: 256, copyToWeb: true, tech: 'Perfectly flat top-down view of a single round coaster, centered, on a solid pure white background, no other objects, no shadow.' }),
  A('coaster_opening_01.png', 'coasters', 'a circular drink coaster viewed perfectly flat from directly above: deep forest-green background with an ornate gold foil border ring and a small abstract geometric emblem in the center, premium embossed finish, subtle metallic sheen.', { alpha: true, size: 256, copyToWeb: true, tech: 'Perfectly flat top-down view of a single round coaster, centered, on a solid pure white background, no other objects, no shadow.' }),
  // ---- Phase 3c — D3.5 Sims-open surroundings (soi anchor) ----
  // neighbour buildings for the back-edge skyline (big painted backdrops)
  A('env_backdrop_shophouse_a_01.png', 'world', 'a three-story Bangkok shophouse building seen straight on: warm cream concrete facade, exposed dark charcoal steel frame, open balconies with slim black metal railings lined with terracotta pots of tropical plants, warm lit windows, a blank sign board, a roll-up shop shutter at street level, an air-conditioning unit on one wall.', { alpha: true, ref: 'soi' }),
  A('env_backdrop_shophouse_b_01.png', 'world', 'a three-story Bangkok shophouse building seen straight on: terracotta-painted facade with warm cream trim, dark steel-framed balconies crowded with monstera and banana plants in terracotta pots, folding wooden shutters, a striped fabric awning over the ground floor, a blank vertical sign board on the corner.', { alpha: true, ref: 'soi' }),
  A('env_backdrop_tower_01.png', 'world', 'a slim modern condominium tower seen straight on: warm cream and muted teal facade, a regular grid of windows with a few balconies holding potted plants, a dark steel crown with a rooftop water tank, warm lit windows scattered across the floors.', { alpha: true, aspect: '9:16', ref: 'soi' }),
  // street furniture (front edges)
  A('prop_tree_street_01.png', 'world', 'a tall tropical rain tree with a slender dark trunk and a wide lush layered green canopy, growing from a low round concrete kerb planter.', { alpha: true, ref: 'soi' }),
  A('prop_lamp_street_01.png', 'world', 'a Bangkok street lamp: a tall dark charcoal steel pole with a single curved arm holding a warm glowing lamp head, a small blank banner bracket midway up the pole.', { alpha: true, aspect: '9:16', ref: 'soi' }),
  A('prop_planter_row_01.png', 'world', 'a straight row of five assorted terracotta pots standing directly on the ground, holding a monstera, a parlor palm, a boston fern, a snake plant and a trailing pothos, slightly different pot heights. Leafy green plants only — no fruit, no bananas, no pedestals, no platforms, no steps, no boxes under the pots.', { alpha: true, aspect: '16:9', ref: 'soi' }),
  A('prop_scooter_01.png', 'world', 'a parked pastel mint motor scooter with a warm cream seat, resting on its kickstand, a small delivery basket on the back.', { alpha: true, ref: 'soi' }),
  // surrounding ground materials (opaque, tileable)
  A('env_floor_asphalt_01.png', 'floors', 'plain dark warm grey asphalt road surface with very subtle aggregate texture only — absolutely no markings, no objects, no shadows, just the bare asphalt.', { tech: FLOOR_TECH, size: 512, ref: 'soi' }),
  A('env_floor_pavers_01.png', 'floors', 'plain warm grey concrete sidewalk paver tiles in a simple square grid only — absolutely no plants, no objects, no shadows, just the bare paver pattern.', { tech: FLOOR_TECH, size: 512, ref: 'soi' }),
  A('env_floor_grass_01.png', 'floors', 'plain lush green lawn grass texture only — absolutely no flowers, no objects, no shadows, just the bare grass.', { tech: FLOOR_TECH, size: 512, ref: 'soi' }),
  // F. UI reference sheets (stored for later wiring)
  A('ui_kit_main_01.png', 'ui', 'a cozy casual game UI kit laid out on a neutral background: a large rounded rectangle panel, a primary button, a secondary button, a row of small circular icon buttons, a horizontal progress bar, a small currency chip, a 4x4 inventory slot grid, and a tab bar with three tabs. Warm cream panels, dark forest-green outlines, terracotta accent colour, soft drop shadows, generous rounded corners.', { aspect: '16:9', tech: 'Flat front-facing view, crisp and readable at small size.' }),
  A('ui_frame_rarity_01.png', 'ui', 'a set of four empty square item slot frames in a row, identical shape but different colours indicating rarity tiers: plain grey, teal, purple, and warm gold with a subtle glow. Rounded corners, clean outline, soft inner shadow, on a neutral dark background.', { aspect: '16:9', tech: 'Flat front-facing view, crisp and readable at small size.' }),
];

// ---------------------------------------------------------------- pipeline
function log(line) {
  fs.appendFileSync(LOG_PATH, line + '\n');
}

async function genAnchor(prompt = ANCHOR_PROMPT, target = REF_PATH) {
  console.log(`Generating style anchor scene (flux-pro-1.1, text-only) -> ${path.basename(target)}…`);
  const task = await bflCreate('/v1/flux-pro-1.1', {
    prompt,
    width: 1440,
    height: 800,
    output_format: 'png',
    safety_tolerance: 2,
  });
  const url = await bflWait(task);
  const buf = await download(url);
  fs.writeFileSync(target, buf);
  log(`| ${path.basename(target)} | flux-pro-1.1 | ${task.id} | ${new Date().toISOString()} |`);
  console.log(`✓ anchor saved -> ${target}`);
}

async function genAsset(asset, refs) {
  const target = path.join(GAME_ASSETS, asset.dir, asset.file);
  const prompt =
    `Using the exact art style, colour palette and line quality of this reference image, ` +
    `create a completely new standalone image: ${asset.desc} ${asset.tech} ${STYLE}`;
  const task = await bflCreate('/v1/flux-kontext-pro', {
    prompt,
    input_image: refs[asset.ref],
    aspect_ratio: asset.aspect,
    output_format: 'png',
    safety_tolerance: 2,
  });
  const url = await bflWait(task);
  const raw = await download(url);
  // keep the raw output so post-processing can be re-tuned without re-billing
  const rawDir = path.join(ROOT, '.asset-raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, asset.file), raw);
  const processed = await postProcess(raw, asset);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, processed);
  if (asset.copyToWeb) {
    const webDir = path.join(ROOT, 'apps', 'web', 'public', 'assets', asset.dir);
    fs.mkdirSync(webDir, { recursive: true });
    fs.writeFileSync(path.join(webDir, asset.file), processed);
  }
  log(`| ${asset.file} | flux-kontext-pro | ${task.id} | ${new Date().toISOString()} |`);
  return target;
}

async function main() {
  const args = process.argv.slice(2);
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(
      LOG_PATH,
      '# Asset Prompts Log\n\nGenerated by scripts/gen-assets.mjs (BFL FLUX). Style anchor: `_STYLE_REF_day.png`.\n\n| file | model | request id | generated at |\n|---|---|---|---|\n',
    );
  }

  if (args.includes('--anchor')) {
    await genAnchor();
    return;
  }
  if (args.includes('--soi-anchor')) {
    await genAnchor(SOI_ANCHOR_PROMPT, SOI_REF_PATH);
    return;
  }
  // re-run post-processing from the kept raw outputs — no API calls, no cost
  if (args.includes('--reprocess')) {
    const rawDir = path.join(ROOT, '.asset-raw');
    let done = 0;
    for (const asset of ASSETS) {
      const rawPath = path.join(rawDir, asset.file);
      if (!fs.existsSync(rawPath)) continue;
      const processed = await postProcess(fs.readFileSync(rawPath), asset);
      const target = path.join(GAME_ASSETS, asset.dir, asset.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, processed);
      if (asset.copyToWeb) {
        const webDir = path.join(ROOT, 'apps', 'web', 'public', 'assets', asset.dir);
        fs.mkdirSync(webDir, { recursive: true });
        fs.writeFileSync(path.join(webDir, asset.file), processed);
      }
      done++;
      console.log(`  ↻ ${asset.file}`);
    }
    console.log(`Reprocessed ${done} assets from .asset-raw (no API calls).`);
    return;
  }
  // strip white halos from already-shipped alpha sprites that have no raw
  if (args.includes('--defringe-existing')) {
    const rawDir = path.join(ROOT, '.asset-raw');
    let done = 0;
    for (const asset of ASSETS) {
      if (!asset.alpha) continue;
      if (fs.existsSync(path.join(rawDir, asset.file))) continue; // reprocess covers these
      const target = path.join(GAME_ASSETS, asset.dir, asset.file);
      if (!fs.existsSync(target)) continue;
      const processed = await defringeExisting(fs.readFileSync(target));
      fs.writeFileSync(target, processed);
      if (asset.copyToWeb) {
        const webDir = path.join(ROOT, 'apps', 'web', 'public', 'assets', asset.dir);
        fs.mkdirSync(webDir, { recursive: true });
        fs.writeFileSync(path.join(webDir, asset.file), processed);
      }
      done++;
      console.log(`  ✂ ${asset.file}`);
    }
    console.log(`Defringed ${done} existing assets in place.`);
    return;
  }

  if (!fs.existsSync(REF_PATH)) {
    console.error('No _STYLE_REF_day.png found. Run with --anchor first.');
    process.exit(1);
  }
  const refs = { day: fs.readFileSync(REF_PATH).toString('base64') };
  if (fs.existsSync(SOI_REF_PATH)) {
    refs.soi = fs.readFileSync(SOI_REF_PATH).toString('base64');
  }

  const force = args.includes('--force');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  let queue = ASSETS.filter((a) => (only ? a.file.includes(only) : true));
  if (!force) {
    queue = queue.filter((a) => !fs.existsSync(path.join(GAME_ASSETS, a.dir, a.file)));
  }
  const noRef = queue.filter((a) => !refs[a.ref]);
  if (noRef.length) {
    console.error(
      `Missing style anchor '${noRef[0].ref}' for ${noRef.length} asset(s). ` +
        `Run with --soi-anchor first.`,
    );
    process.exit(1);
  }
  console.log(`Generating ${queue.length}/${ASSETS.length} assets (concurrency ${CONCURRENCY})…`);

  const failures = [];
  let done = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const asset = queue.shift();
      if (!asset) break;
      try {
        await genAsset(asset, refs);
        done++;
        console.log(`  ✓ [${done}] ${asset.file}`);
      } catch (err) {
        failures.push({ file: asset.file, error: String(err) });
        console.error(`  ✗ ${asset.file}: ${err}`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`\nDone: ${done} ok, ${failures.length} failed.`);
  if (failures.length) {
    failures.forEach((f) => console.error(`  FAILED ${f.file}: ${f.error}`));
    process.exitCode = 1;
  }
}

await main();
