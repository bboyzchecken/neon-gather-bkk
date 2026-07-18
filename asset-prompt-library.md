# Cozy Avenue — Production Asset Prompt Library
### ล็อกสไตล์จาก concept ที่อนุมัติแล้ว (Bangkok Urban Cozy / Isometric)

---

## 0. อ่านก่อนเริ่ม — 3 เรื่องที่ต้องเข้าใจ

### 0.1 ภาพ concept ที่ gen มาแล้ว ≠ asset ที่เอาไปใช้ได้
ภาพ overview 2 ใบที่ได้มา คือ **"เป้าหมาย"** ไม่ใช่ของที่ตัดแบ่งเอาไปใช้ได้จริง
เพราะ perspective กับแสงถูก bake ติดมากับภาพทั้งใบแล้ว ตัดชิ้นออกมาแล้วจะไม่ต่อกับชิ้นอื่น
→ ต้อง gen ทีละชิ้นใหม่ โดยใช้ภาพนั้นเป็น **style reference**

### 0.2 บันทึกภาพ 2 ใบนี้เป็นไฟล์อ้างอิงถาวร
```
_STYLE_REF_day.png     ← ภาพกลางวัน
_STYLE_REF_night.png   ← ภาพกลางคืน
```
**ทุกครั้งที่ gen asset ต้องใส่ไฟล์นี้เป็น reference เสมอ** (Midjourney: `--sref`, ตัวอื่น: image-to-image / style reference / IP-adapter)
ถ้าไม่ใส่ → สไตล์จะ drift ทันทีภายใน 10 ชิ้น และจะกลายเป็นเกมที่ดูเหมือนปะติดปะต่อจากหลายเกม

### 0.3 ★ อย่า gen asset 2 ชุด (กลางวัน/กลางคืน)
นี่คือกับดักที่แพงที่สุด ภาพกลางคืนที่ได้มาสวยมาก แต่ **ห้ามทำเป็น asset ชุดที่สอง**

**วิธีที่ถูก:**
| Layer | ทำยังไง |
|---|---|
| Asset หลัก | gen เป็น **แสงกลางวันแบบ neutral ชุดเดียว** |
| กลางคืน | ใส่ **tint สีน้ำเงินเขียวทับทั้งฉาก** ใน Phaser (blend mode: multiply) |
| ไฟหน้าต่าง/ไฟนีออน | gen เป็น **emissive layer แยก** (พื้นดำ เรืองแสงล้วน) แล้ววางทับแบบ additive |

→ ประหยัดงบ art ครึ่งหนึ่ง + เปลี่ยนเวลาในเกมได้ลื่นไหล (เย็น → ค่ำ → ดึก) แทนที่จะมีแค่ 2 สถานะ
→ ผูกกับ "เวลาเข้ากะพนักงาน NPC" ที่ออกแบบไว้ได้พอดี

---

## 1. ★ STYLE DNA (บล็อกหลัก — ใส่ทุก prompt ห้ามขาด)

```
Clean isometric game art illustration. Even-weight dark charcoal linework, flat color fills with
soft subtle shading, no heavy gradients. Warm Southeast Asian urban palette: terracotta clay,
warm cream concrete, dark forest-green steel framing, teak wood, muted teal accents.
Tropical foliage in terracotta pots. Matte materials, warm natural light.
Modern Bangkok community mall aesthetic. Cozy, calm, inviting.
No readable text, no lettering, no signage copy.
```

### Palette ที่ถอดจากภาพ (ให้ artist/dev ใช้อ้างอิง)
| ชื่อ | ใช้กับ | โทน |
|---|---|---|
| Terracotta | กระถาง, พื้นทางเดิน, ผนังอิฐ | ส้มอิฐอุ่น |
| Warm Cream | ผนังคอนกรีต, ฝ้า | ครีมอมเหลือง |
| Forest Steel | โครงเหล็ก, ราวกันตก, กรอบกระจก | เขียวเข้มเกือบดำ |
| Teak | พื้นไม้, เคาน์เตอร์, โต๊ะ | น้ำตาลอุ่น |
| Teal Accent | กันสาด, ป้าย, ของตกแต่ง | เขียวน้ำทะเลหม่น |
| Foliage Green | ต้นไม้ (ใช้ 3 เฉดขึ้นไป) | เขียวสด→เขียวเข้ม |
| Neon Pink / Cyan | **เฉพาะ emissive layer กลางคืน** | ชมพูจัด / ฟ้าน้ำแข็ง |

> **ต้นไม้เขตร้อนคือลายเซ็นของเกมนี้** — ในภาพ concept มันคือสิ่งที่ทำให้ดูเป็นกรุงเทพจริงๆ ไม่ใช่เมืองฝรั่ง
> ทุก asset สภาพแวดล้อมควรมีต้นไม้อย่างน้อย 1 ต้นติดมาด้วย ยกเว้นชิ้นที่ต้องวางเดี่ยวๆ

---

## 2. TECH SPEC — เลือกใช้ตามประเภท asset

### TECH-WORLD (ของทุกชิ้นที่วางในโลกเกม)
```
Single object centered on a fully transparent background. Isometric 2:1 dimetric angle matching
the reference exactly. Light source consistently from the upper-left. No cast shadow on the ground.
No background scenery, no floor, no other objects. Full object visible, not cropped.
```
> **ทำไมห้าม bake เงา:** ของชิ้นเดียวกันต้องวางได้ทั้งบนพื้นกระเบื้อง พื้นไม้ พื้นคอนกรีต
> ให้ Phaser วาดเงา contact shadow เป็น sprite แยกทีหลัง (ellipse เบลอๆ ใบเดียวใช้ได้ทุกชิ้น)

### TECH-ICON (ไอเทมในกระเป๋า/ตลาด/เมนู)
```
Centered on a plain neutral background. Three-quarter view, slightly from above.
Consistent scale and consistent lighting from the upper-left across all icons.
Clear readable silhouette. No text.
```

### TECH-PORTRAIT (ตัวละคร NPC ระบบหัวใจ)
```
Bust portrait, front-facing, chest up, on a plain neutral background.
Soft even lighting. Clean linework, cel-shaded. No text.
```

### TECH-UI (หน้าจอ/ปุ่ม/ไอคอน UI)
```
Flat front-facing view on a neutral background. Rounded corners, clean dark outlines,
soft drop shadows. Crisp and readable at small size. No text, no lettering.
```

### TECH-FLAT (coaster / ป้าย / texture)
```
Perfectly flat top-down view, no perspective, centered, on a transparent background. No text.
```

---

## 3. ★ สเกลกริดมาตรฐาน (ล็อกตัวเลขไว้ ห้ามเปลี่ยนกลางทาง)

| ของ | ขนาด (px) | หมายเหตุ |
|---|---|---|
| **Iso tile ฐาน** | **128 × 64** | หน่วยวัดของทุกอย่าง |
| Plot ร้านเช่า (4×4 tile) | 512 × 256 (footprint) | ตามที่ล็อกใน Phase 0 |
| ความสูงตัวละคร | ~110 px | ≈ 1.7 tile |
| โต๊ะ / เก้าอี้ | 1 tile footprint | โต๊ะสูง ~50px |
| ตู้กดอัตโนมัติ | 1 tile footprint, สูง ~150px | |
| บูธถ่ายรูป | 2×2 tile, สูง ~200px | |
| ความสูงชั้น | 256 px | ระยะระหว่างชั้นในตึก |
| **Item icon (source)** | **512 × 512** | ย่อใช้จริง 128×128 ใน UI |
| **Coaster** | **256 × 256** | ตามที่ล็อกในดีไซน์ของสะสม |
| Portrait NPC | 1024 × 1536 | |
| ภาพพิเศษ Lv10 | 1920 × 1080 | สำหรับบูธถ่ายรูป + แชร์ |
| Ad banner slot | 512 × 256 | สัดส่วน 2:1 |

> **เทคนิค:** gen ที่ความละเอียดสูงกว่านี้ 2-4 เท่าเสมอ แล้วค่อยย่อลงมา — ภาพจะคมกว่าและได้ retina/HiDPI ฟรี

---

## 4. สูตร Prompt + Naming Convention

### สูตร
```
[ASSET DESCRIPTION] + [STYLE DNA] + [TECH SPEC ที่เหมาะ] + [--sref _STYLE_REF_day.png] + [--ar]
```

### Naming convention (บังคับใช้ตั้งแต่ไฟล์แรก)
```
env_facade_a_01.png          สภาพแวดล้อม/สถาปัตยกรรม
prop_table_round_01.png      เฟอร์นิเจอร์/props
icon_drink_coffee_iced.png   ไอคอนไอเทม
icon_fish_shrimp_rare.png
char_avatar_base_walk_s.png  ตัวละครผู้เล่น
npc_mina_portrait_smile.png  NPC ระบบหัวใจ
ui_panel_rounded.png         UI
vfx_ripple_sheet.png         เอฟเฟกต์
emis_neon_pink_bar.png       emissive layer กลางคืน
coaster_shop012_opening.png  ของสะสม
```

---

## 5. PROMPT LIBRARY

---

### A. สถาปัตยกรรม / โครงตึก

**A1 — บล็อกร้านว่าง (ยังไม่มีคนเช่า)**
```
A single empty rentable shop unit, plain cream concrete frame with dark forest-green steel posts,
a closed roll-down metal shutter, a blank rectangular sign panel above the entrance, a low concrete
step at the front, one potted monstera beside the doorway.
[STYLE DNA] [TECH-WORLD]
```

**A2 — Facade Template A: มินิมอล / คาเฟ่**
```
A single small shop facade unit: floor-to-ceiling glass front with dark forest-green steel frame,
a blank rectangular sign panel above the door, a simple flat awning, two potted plants flanking
the entrance, a hint of warm interior visible through the glass.
[STYLE DNA] [TECH-WORLD]
```

**A3 — Facade Template B: วินเทจ / ไม้**
```
A single small shop facade unit with a teak wood front, a blank hand-painted sign board above,
a striped fabric awning, wooden shutters folded open, a wooden crate and a fern in a terracotta
pot beside the entrance.
[STYLE DNA] [TECH-WORLD]
```

**A4 — Facade Template C: ร้านอาหาร / สตรีทฟู้ด**
```
A single small food stall facade unit: a stainless counter facing the walkway, a corrugated metal
awning, a blank menu board panel above, stacked plastic stools beside it, a banana plant in a
terracotta pot at the corner.
[STYLE DNA] [TECH-WORLD]
```

**A5 — โมดูลลิฟต์ (ประตูปิด)**
```
An elevator entrance module built into a concrete wall: dark forest-green steel frame, closed
brushed metal double doors, a small call button panel beside it, a blank floor indicator panel above.
[STYLE DNA] [TECH-WORLD]
```

**A6 — โมดูลลิฟต์ (ประตูเปิด)**
```
An elevator entrance module with the metal double doors fully open, revealing a small interior with
warm ceiling light, a handrail on the back wall, and a teak floor. Dark forest-green steel frame,
a call button panel beside it.
[STYLE DNA] [TECH-WORLD]
```

**A7 — บันได**
```
A straight flight of concrete stairs with a dark forest-green steel railing, a small landing at the
top, one potted fern at the base.
[STYLE DNA] [TECH-WORLD]
```

**A8 — ชุดพื้น (tileable)**
```
A set of four seamless isometric floor tile patterns arranged in a row on a neutral background:
warm terracotta pavers, cream polished concrete, teak wood planks, and small teal mosaic tiles.
Each tile must tile seamlessly. Flat even lighting, no objects, no shadows.
[STYLE DNA]
```

**A9 — ราวกันตก + กระบะต้นไม้ (ชิ้นต่อได้)**
```
A modular railing segment: dark forest-green steel balustrade with a slim top rail, attached to a
long terracotta planter box filled with trailing tropical plants. Designed to tile horizontally
and connect seamlessly to identical segments.
[STYLE DNA] [TECH-WORLD]
```

**A10 — ระเบียงดาดฟ้า**
```
A rooftop terrace section: teak deck flooring, a low concrete parapet, a large potted banana plant,
a wooden bench, and a string of small hanging bulbs suspended between two posts.
[STYLE DNA] [TECH-WORLD]
```

---

### B. เฟอร์นิเจอร์ / Props

**B1 — ชุดโต๊ะ-เก้าอี้ (สำคัญ: ผูกกับระบบสั่ง-เสิร์ฟ)**
```
A set of three separate seating arrangements arranged in a row on a transparent background:
(1) a small round teak café table with two matching chairs,
(2) a square teak table with four chairs,
(3) a tall bar table with two stools.
All at the same isometric angle, same scale, same lighting from upper-left, evenly spaced.
[STYLE DNA] [TECH-WORLD]
```
> **หมายเหตุ dev:** โต๊ะแต่ละแบบต้องกำหนด **anchor point** สำหรับวางแก้ว/จาน (2-4 จุดต่อโต๊ะ) ไม่งั้นของจะวางทับกันมั่ว — ตรงกับที่ระบุไว้ในดีไซน์ระบบโต๊ะ

**B2 — เคาน์เตอร์บาร์**
```
A bar counter with a teak wood top and terracotta tiled base, three stools lined up in front,
a back shelf unit behind it filled with rows of bottles and hanging glassware, a small potted
plant at one end.
[STYLE DNA] [TECH-WORLD]
```

**B3 — ชุดต้นไม้ (ลายเซ็นของเกม — ทำให้ครบ)**
```
A set of eight tropical potted plants in terracotta pots of varying sizes, arranged evenly in a row
on a transparent background: monstera, banana plant, boston fern, snake plant, small palm, trailing
pothos, bird of paradise, and a low succulent bowl.
All at the same isometric angle, same lighting from upper-left, consistent scale relative to
a 128x64 floor tile.
[STYLE DNA]
```

**B4 — ตู้กดอัตโนมัติ**
```
A tall vending machine: warm cream body with terracotta accent panels and a dark forest-green frame,
a large glass front showing neat rows of colorful drink bottles and cans, a blank panel at the top,
a dispenser slot at the bottom, a small blank selection keypad.
[STYLE DNA] [TECH-WORLD]
```

**B5 — บูธถ่ายรูป**
```
A photo booth cabinet: warm cream body with a dark forest-green steel frame, a heavy teal curtain
drawn to one side, a small teak bench visible inside, a camera lens module on the interior wall,
a blank display panel on the outside, a potted fern beside it.
[STYLE DNA] [TECH-WORLD]
```

**B6 — ตู้โชว์ของสะสม**
```
A glass display cabinet with a dark forest-green steel frame and teak base, three empty glass
shelves, warm interior lighting, standing upright against nothing.
[STYLE DNA] [TECH-WORLD]
```

**B7 — ชุดกิจกรรมมือว่าง**
```
A set of four separate arcade-style objects arranged in a row on a transparent background:
(1) a retro arcade cabinet with a blank screen,
(2) a claw crane machine with colorful plush toys inside,
(3) a jukebox with a warm glowing front,
(4) a wall-mounted dartboard on a wooden backing panel.
All in the same warm cream, terracotta, and forest-green material language.
Same isometric angle, same scale, same lighting from upper-left.
[STYLE DNA] [TECH-WORLD]
```

**B8 — ไฟและของตกแต่ง**
```
A set of six lighting and decor objects in a row on a transparent background: a hanging pendant lamp
with a warm shade, a floor standing lamp, a string of small bulbs, a wall sconce, a small table
candle, and a paper lantern. Same isometric angle, same scale, same lighting from upper-left.
[STYLE DNA]
```

**B9 — ท่าเรือตกปลา**
```
A small wooden pier deck section extending over calm water: weathered teak planks, a rope-tied
mooring post, a metal bucket, a tackle box, and reeds growing at the water edge.
[STYLE DNA] [TECH-WORLD]
```

---

### C. ไอคอนไอเทม (TECH-ICON ทั้งหมด)

**C1 — เครื่องดื่ม**
```
Game item icon sheet on a plain neutral background, an evenly spaced 4x3 grid of 12 drink icons:
iced black coffee in a tall glass, iced latte, hot coffee cup on a saucer, cocktail in a coupe glass,
highball with a lime wedge, draft beer glass, Thai iced tea, fruit smoothie, bottled soda, a teapot,
a plain water glass, and a wine glass.
Consistent three-quarter angle slightly from above, consistent scale, consistent lighting from
upper-left, evenly spaced, clear silhouettes.
[STYLE DNA] --ar 1:1
```

**C2 — อาหาร**
```
Game item icon sheet, evenly spaced 4x3 grid of 12 food icons: a bowl of noodles, a plate of
fried rice, grilled skewers, spring rolls, a small salad bowl, a slice of cake, a scoop of ice cream,
a basket of fries, a sandwich, a bowl of soup, a plate of dumplings, and a fruit platter.
Consistent three-quarter angle, consistent scale and lighting from upper-left.
[STYLE DNA] [TECH-ICON] --ar 1:1
```

**C3 — ปลาและกุ้ง (ระบบตกปลา)**
```
Game item icon sheet, evenly spaced 4x3 grid of 12 aquatic creatures shown in clean side profile:
six freshwater fish of different shapes and colors, two catfish, two shrimp of different sizes,
one crab, one eel. Each species has a distinct silhouette and color.
Consistent scale relative to each other, consistent lighting from upper-left.
[STYLE DNA] [TECH-ICON] --ar 1:1
```

**C4 — ปลาระดับตำนาน (ทำแยก งานประณีตกว่า)**
```
A single legendary fish item icon: a large ornate fish with iridescent pearlescent scales shifting
between teal and warm gold, elegant flowing fins, a subtle soft glow outline.
Clean side profile, centered.
[STYLE DNA] [TECH-ICON] --ar 1:1
```
> **หลักคุมงบ:** ปลาธรรมดา/หายาก ใช้กรอบสี UI บอก rarity พอ — วาดพิเศษเฉพาะ tier ตำนานเท่านั้น

**C5 — อุปกรณ์ตกปลา**
```
Game item icon sheet, evenly spaced 3x2 grid of 6 fishing equipment icons: a basic bamboo fishing
rod, an advanced fishing rod with a reel, a jar of bait, a shrimp trap basket, a landing net,
and a wicker creel basket.
Consistent three-quarter angle, consistent scale and lighting from upper-left.
[STYLE DNA] [TECH-ICON] --ar 1:1
```

**C6 — วัสดุคราฟต์ / ของขวัญ (ผูกกับระบบหัวใจ)**
```
Game item icon sheet, evenly spaced 4x3 grid of 12 gift and material icons: a wrapped gift box,
a bouquet of tropical flowers, a small potted succulent, a handmade ceramic mug, a wooden carving,
a woven basket, a spool of thread, a bundle of herbs, a jar of honey, a seashell, a vinyl record,
and a photo frame.
Consistent three-quarter angle, consistent scale and lighting from upper-left.
[STYLE DNA] [TECH-ICON] --ar 1:1
```

---

### D. ของสะสม

**D1 — Coaster เปล่า (template สำหรับผู้เล่นอัปโหลดลาย)**
```
A blank circular drink coaster viewed perfectly flat from directly above, plain warm cream surface
with a thin dark border ring, subtle pressed paper texture, no design in the center, no text.
[STYLE DNA] [TECH-FLAT] --ar 1:1
```

**D2 — Opening Night Coaster (ของรางวัลพิเศษ)**
```
A circular drink coaster viewed perfectly flat from directly above: deep forest-green background
with an ornate gold foil border ring and a small abstract geometric emblem in the center,
premium embossed finish, subtle metallic sheen. No text, no lettering.
[STYLE DNA] [TECH-FLAT] --ar 1:1
```

**D3 — สมุด Tasting Passport**
```
An open passport-style booklet viewed flat from above: warm cream pages with a grid of empty
circular stamp slots, a few slots filled with small colorful ink stamps of drink silhouettes,
a teak-brown leather cover edge visible. No readable text, no lettering.
[STYLE DNA] [TECH-FLAT] --ar 1:1
```

**D4 — แผ่นเสียง**
```
Game item icon sheet, evenly spaced 3x2 grid of 6 vinyl records in paper sleeves, each sleeve a
different abstract geometric cover design in the game palette, no text on any sleeve.
Consistent three-quarter angle, consistent scale and lighting.
[STYLE DNA] [TECH-ICON] --ar 1:1
```

---

### E. ตัวละคร ⚠️

> **อ่านก่อน:** หมวดนี้ใช้ AI ได้แค่ขั้น **concept/สำรวจ** เท่านั้น
> ห้ามเอาผลลัพธ์ไปเป็น production asset โดยตรง — เหตุผลอยู่ในข้อ 8

**E1 — Avatar ผู้เล่น (concept)**
```
Character lineup on a plain neutral background: five young adult characters standing in a row,
full body, front view, casual Southeast Asian streetwear — oversized shirts, tote bags, sneakers,
caps. Different body types, skin tones, and hairstyles. Simple readable silhouettes, relaxed
friendly poses. Slightly stylized proportions, head slightly larger than realistic.
[STYLE DNA] --ar 16:9
```

**E2 — NPC พนักงาน (concept สำหรับส่งต่อนักวาด)**
```
Character concept sheet on a plain neutral background: one young adult bartender character,
full body front view, and the same character in three-quarter view.
Casual uniform with an apron, relaxed confident posture, warm friendly expression.
Distinct memorable silhouette.
[STYLE DNA] --ar 16:9
```

**E3 — Sprite ในโลกเกม (concept)**
```
A small stylized character shown from an isometric 2:1 game camera angle, standing idle,
casual streetwear, slightly chibi proportions, clear readable silhouette at small size,
centered on a transparent background.
[STYLE DNA] [TECH-WORLD]
```

---

### F. UI

**F1 — UI Kit หลัก**
```
A cozy casual game UI kit laid out on a neutral background: a large rounded rectangle panel,
a primary button, a secondary button, a row of small circular icon buttons (close X, gear, bag,
scroll, map pin, heart), a horizontal progress bar, a small currency chip, a 4x4 inventory slot grid,
and a tab bar with three tabs.
Warm cream panels, dark forest-green outlines, terracotta accent color, soft drop shadows,
generous rounded corners. Crisp and readable at small size.
[STYLE DNA] [TECH-UI] --ar 16:9
```

**F2 — มาตรวัดหัวใจ (ระบบ Heart)**
```
A row of ten small heart icons on a transparent background, five filled and five empty,
warm terracotta pink fill, clean dark outline, flat front-facing, plus one larger heart icon
with a soft glow beside them.
[STYLE DNA] [TECH-UI] --ar 16:9
```

**F3 — การ์ดเควส / ตัวติดตาม**
```
A quest tracker UI card on a neutral background: a warm cream rounded card with a small icon slot
on the left, three empty text placeholder bars, a checkbox column on the right, and a thin progress
bar at the bottom. Soft shadow, dark forest-green outline. No readable text, use plain grey
placeholder bars instead of letters.
[STYLE DNA] [TECH-UI] --ar 1:1
```

**F4 — กรอบ Rarity (ประหยัดงบ art มหาศาล)**
```
A set of four empty square item slot frames in a row on a transparent background, identical shape
but different colors indicating rarity tiers: plain grey, teal, purple, and warm gold with a subtle
glow. Rounded corners, clean outline, soft inner shadow.
[STYLE DNA] [TECH-UI] --ar 16:9
```

**F5 — Minimap / ป้ายบอกชั้น**
```
A small circular minimap UI frame on a neutral background: a dark forest-green ring border,
a warm cream interior, small terracotta location dots, and a vertical floor indicator strip beside
it with four empty level markers. No text.
[STYLE DNA] [TECH-UI] --ar 1:1
```

---

### G. เอฟเฟกต์ + Emissive Layer (กลางคืน)

**G1 — ★ Neon emissive layer (หัวใจของโหมดกลางคืน)**
```
Emissive light layer only: glowing neon sign panels in hot pink and cyan, pure luminous glow with
soft bloom, floating on a solid pure black background. No linework, no object detail,
no background scenery, no text. Only the light itself.
```
> วางทับ asset กลางวันด้วย **additive blend** ใน Phaser → ได้ภาพกลางคืนแบบภาพที่ 2 โดยไม่ต้อง gen ใหม่

**G2 — แสงหน้าต่าง emissive**
```
Emissive light layer only: warm golden rectangular window glows of various sizes, soft falloff at
the edges, on a solid pure black background. No linework, no detail, no text.
```

**G3 — ระลอกน้ำ (มินิเกมตกปลา)**
```
A single water ripple effect: three concentric rings expanding on a calm water surface,
viewed from an isometric 2:1 angle, pale teal and white, soft edges, on a transparent background.
No text.
```
> ⚠️ อย่าสั่ง AI ทำ sprite sheet หลายเฟรม — มันทำเฟรมให้ต่อเนื่องกันไม่ได้จริง gen เฟรมเดียวแล้วให้ Phaser ทำ tween ขยาย+จางแทน (ได้ผลดีกว่าและเบากว่า)

**G4 — ประกายตอนตกปลาได้**
```
A burst of small sparkle particles: soft four-pointed stars of varying sizes in warm gold and pale
teal, radiating outward from a center point, on a transparent background. No text.
```

**G5 — หัวใจลอย (ระบบ Heart)**
```
A set of small floating heart particles of varying sizes, warm terracotta pink with soft glow,
scattered on a transparent background. No text.
```

---

### H. พื้นที่โฆษณา (Phase 3)

**H1 — บิลบอร์ดเปล่า**
```
A blank billboard panel mounted on a building wall: dark forest-green steel frame, plain flat white
empty display surface with no content, two small spotlights mounted above it pointing down.
[STYLE DNA] [TECH-WORLD]
```

**H2 — จอ LED เปล่า (ในลิฟต์/ลอบบี้)**
```
A blank wall-mounted LED display screen: thin dark bezel, plain flat pale glowing empty screen
surface, mounted on a cream concrete wall.
[STYLE DNA] [TECH-WORLD]
```

**H3 — กรอบโปสเตอร์เปล่า**
```
A blank poster frame mounted flat on a wall: slim dark forest-green frame, plain empty cream
poster surface inside, slight paper texture.
[STYLE DNA] [TECH-FLAT]
```
> ทั้ง 3 ชิ้นต้อง **เว้นพื้นที่ว่างสะอาดจริงๆ** เพราะระบบจะเอาภาพจากธุรกิจมาวางทับตรงนั้น
> → กำหนด safe area ในโค้ดให้ตรงกับสัดส่วน 512×256

---

### I. แบรนด์ / การตลาด

**I1 — Key Art (มีแล้ว ✓)**
ใช้ภาพ overview 2 ใบที่ได้มาเป็น key art ได้เลย — เว้นพื้นที่บนไว้ใส่โลโก้

**I2 — Logo mark**
```
A minimal logo mark for a cozy community game: an abstract symbol combining a simple building
silhouette with a monstera leaf, geometric and balanced, single flat color, centered on a white
background. No text, no lettering.
--ar 1:1
```

**I3 — App icon**
```
A mobile app icon for a cozy social game: a single small isometric building with a glowing warm
window and one monstera leaf beside it, centered, on a soft terracotta-to-cream gradient background,
rounded square format, simple and readable at very small size. No text.
[STYLE DNA] --ar 1:1
```

**I4 — Season banner (สำหรับ guest artist collab)**
```
A promotional banner for a cozy game season: a warm bar interior at golden hour seen from an
isometric angle, tropical plants, glowing pendant lamps, empty space on the right third for
character artwork placement. No text, no characters.
[STYLE DNA] --ar 16:9
```

---

## 6. Negative Prompt (สำหรับ SD / Flux / ตัวที่รองรับ)
```
blurry, low resolution, distorted geometry, wrong perspective, inconsistent line weight,
garbled text, letters, words, signage copy, watermark, signature, photorealistic, 3D render,
oversaturated, harsh contrast, drop shadow on ground, white halo around edges, cluttered background,
multiple objects when one is requested, cropped object, jpeg artifacts
```

---

## 7. ✅ QA Checklist (เช็คทุกชิ้นก่อนเข้า repo)

- [ ] พื้นหลังโปร่งใสจริง — ไม่มีขอบขาว/เทาเรืองรอบวัตถุ
- [ ] มุม isometric ตรงกับ `_STYLE_REF_day.png` (ทาบดูจริง อย่าเดา)
- [ ] แสงมาจากมุมซ้ายบนเหมือนทุกชิ้น
- [ ] ไม่มีเงาบนพื้น bake ติดมา
- [ ] สเกลถูกเทียบกับ tile 128×64 และตัวละคร 110px
- [ ] ความหนาเส้น outline เท่ากับ asset ชิ้นอื่นในหมวดเดียวกัน
- [ ] สีอยู่ใน palette (ข้อ 1) — ไม่มีสีหลุดโทน
- [ ] **ไม่มีตัวหนังสือหลุดมาแม้แต่ตัวเดียว**
- [ ] ย่อเหลือ 50% แล้วยังดูออกว่าคืออะไร
- [ ] ตั้งชื่อไฟล์ตาม convention ข้อ 4

---

## 8. ⚠️ สิ่งที่ AI ทำไม่ได้ — ต้องจ้างคน

| งาน | ทำไม AI ไม่ผ่าน | ทางออก |
|---|---|---|
| **ชุดสีหน้า NPC (6-8 แบบ)** | คุมให้เป็น "คนเดิม" ข้ามทุกสีหน้าไม่ได้จริง | จ้างนักวาด — ใช้ E2 เป็น concept ส่งให้ |
| **Walk cycle / animation** | ทำเฟรมต่อเนื่องไม่ได้ ตัวละครเพี้ยนทุกเฟรม | จ้าง animator หรือใช้ skeletal rig (Spine/DragonBones) |
| **ภาพพิเศษ Lv10** | เป็นภาพขายของ ต้องเป๊ะ | จ้างนักวาด — นี่คือจุดที่ guest artist คุ้มที่สุด |
| **Sprite sheet เอฟเฟกต์** | เฟรมไม่ต่อเนื่อง | gen เฟรมเดียว + tween ใน Phaser |
| **ป้าย/ตัวหนังสือ** | เขียนเพี้ยนทุกครั้ง | ใส่ text ด้วย Phaser BitmapText ทับ slot ที่เว้นไว้ |
| **Tileable texture เนียนจริง** | ขอบมักไม่ต่อ | ให้ AI ทำร่าง แล้วให้คนแก้ขอบใน Photoshop/Aseprite |

> **สรุปการแบ่งงาน:** AI ทำ **ของ (props/env/icon/UI)** ได้ดีมาก | คนทำ **คน (character/animation)**
> — ตรงกับที่วิเคราะห์ไว้ตั้งแต่ต้นว่าทำไม cozy game ถึงเหมาะกว่า RO

---

## 9. ลำดับการผลิต (เรียงตามที่ควรทำจริง)

| ลำดับ | หมวด | เหตุผล |
|---|---|---|
| **1** | A8 พื้น + A1-A4 facade + B1 โต๊ะ + B3 ต้นไม้ | ได้ฉากเดินได้จริงเร็วที่สุด → เทส core loop ได้ |
| 2 | C1 เครื่องดื่ม + C3 ปลา + F1 UI kit + F4 กรอบ rarity | ครบ loop สั่ง-เสิร์ฟ-ตกปลา-เก็บของ |
| 3 | B4 ตู้กด, B9 ท่าเรือ, D1 coaster | ระบบสะสมเริ่มทำงาน |
| 4 | E1/E3 avatar concept → **ส่งนักวาด** | คนใช้เวลานาน เริ่มขนานกันตั้งแต่เนิ่นๆ |
| 5 | A5-A7 ลิฟต์/บันได + G1-G2 emissive | เปิดหลายชั้น + โหมดกลางคืน |
| 6 | B5 บูธถ่ายรูป + B6 ตู้โชว์ + B7 กิจกรรม | เติมความ cozy |
| 7 | E2 NPC concept → **guest artist** | ระบบหัวใจ (ทำ 1 ตัวก่อน) |
| 8 | H1-H3 ad slots | Phase 3 เท่านั้น |

---

## 10. Workflow ที่แนะนำ (ทำตามนี้จะไม่หลุดสไตล์)

1. **gen ทีละหมวด ในเซสชันเดียว** พร้อม `--sref` ตัวเดิมเสมอ — อย่าสลับหมวดไปมา
2. **ขอทีละ 4 ตัวเลือก** ต่อ prompt แล้วเลือกอันที่เข้ากับ reference ที่สุด
3. **ชิ้นที่ผ่านแล้ว = reference ใหม่** ของหมวดนั้น (เช่น โต๊ะที่ผ่าน → ใช้เป็น ref ตอน gen เก้าอี้)
4. **เทียบเป็นชุด ไม่ใช่ทีละชิ้น** — เอามาวางเรียงบน canvas เดียวทุก 10 ชิ้น ถ้ามีชิ้นไหน "แปลกแยก" ให้ gen ใหม่ทันที อย่าปล่อยผ่าน
5. **เก็บ prompt + seed ที่ผ่านไว้ในไฟล์** `ASSET_PROMPTS_LOG.md` — วันหลังต้อง gen เพิ่มจะได้เหมือนเดิม
6. **ทุกชิ้นผ่าน QA ข้อ 7 ก่อนเข้า repo** — asset ที่หลุดสไตล์ 1 ชิ้นทำลายความกลมกลืนของทั้งฉาก
