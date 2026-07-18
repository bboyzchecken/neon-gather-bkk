# Cozy Avenue — Art Style Exploration Prompt Kit

> เป้าหมาย: gen ภาพ concept เพื่อ **เลือกแนวทาง art style + brand** ก่อนเริ่ม production
> วิธีใช้หลัก: ใช้ **ฉากมาตรฐานเดิม** (Base Scene) แล้วเปลี่ยนแค่ **Style Block** → จะเทียบสไตล์ได้แบบยุติธรรม
> เขียน prompt เป็นภาษาอังกฤษเสมอ (โมเดล gen รูปเข้าใจดีกว่าไทยมาก)

---

## 1. สูตรประกอบ Prompt

```
[BASE SCENE] + [STYLE BLOCK] + [PALETTE] + [LIGHTING] + [aspect ratio]
```

กติกาสำคัญ:
- **อย่าใส่ตัวอักษร/ป้ายที่ต้องอ่านออก** — โมเดล gen รูปเขียนตัวหนังสือเพี้ยนเกือบทุกครั้ง ให้ใส่ `no readable text, no lettering` แทน แล้วค่อยใส่ป้ายจริงตอนทำ asset
- **อย่าอ้างชื่อเกมจริง** (เช่น "in the style of [ชื่อเกมดัง]") — นอกจากเสี่ยงเรื่อง IP ตอนเอาไปใช้เชิงพาณิชย์แล้ว การบรรยาย "คุณลักษณะ" ตรงๆ ยังให้ผลลัพธ์ที่คุมได้ดีกว่าด้วย
- ใช้ aspect ratio: ฉาก hero = `16:9`, asset sheet / avatar lineup = `1:1`

---

## 2. Base Scenes (ใช้ชุดนี้ซ้ำกับทุกสไตล์)

### Scene 1 — Hero Shot: Avenue Exterior (ภาพหลักสำหรับตัดสินใจ)
```
Isometric view of a small three-story community mall on a quiet urban street corner.
Ground floor: an open café with outdoor tables, chairs, and a vending machine near the entrance.
Second floor: small boutique shops with glass storefronts and awnings.
Rooftop: a garden terrace with string lights and benches.
A blank billboard panel on the side wall. Potted plants along the walkway.
A few small stylized people walking, sitting, and chatting.
Clean readable composition, no readable text, no lettering.
```

### Scene 2 — Bar / Café Interior (เทสระบบโต๊ะ-เสิร์ฟ)
```
Isometric cutaway view of a cozy small bar interior.
A wooden counter with a bartender behind it, four round tables with chairs,
drinks and small plates sitting on the tables, one waiter character carrying a tray
walking between tables, shelves of bottles on the back wall, hanging lamps, plants in the corner.
Evening mood, no readable text, no lettering.
```

### Scene 3 — Fishing Spot (เทสมินิเกม)
```
Isometric view of a small wooden pier over calm water.
One character sitting on the edge holding a fishing rod, a bucket and tackle box beside them,
gentle ripples on the water, a few fish visible under the surface, reeds and lily pads at the edge.
Soft morning light with light mist, no readable text.
```

### Scene 4 — Item Asset Sheet (เทสว่า asset ย่อยจะออกมาหน้าตายังไง)
```
Game item icon sheet on a plain neutral background, evenly spaced grid of 12 icons:
iced coffee glass, cocktail, plate of noodles, small potted plant, wooden chair, table lamp,
fish, shrimp, fishing rod, cardboard box, blank sign board, camera.
Consistent scale, consistent three-quarter angle, consistent lighting across all icons,
no readable text, no lettering.
```

### Scene 5 — Avatar Lineup (เทส character design)
```
Character lineup on a plain neutral background.
Five cute stylized human characters standing in a row, full body, front view,
casual streetwear outfits, different body types, skin tones, and hairstyles,
simple readable silhouettes, friendly relaxed poses, no weapons.
```

### Scene 6 — Photo Booth + Vending Corner (เทส social landmark)
```
Isometric view of a small indoor corner: a photo booth with a curtain and a bench inside,
a vending machine beside it filled with colorful drinks, a small potted plant.
Two characters posing inside the booth, a third waiting outside.
Tiled floor, soft indoor lighting, no readable text.
```

### Scene 7 — UI / HUD Mockup (เทสว่าสไตล์นี้ทำ UI ได้ไหม)
```
Cozy casual game UI mockup on a neutral background:
an inventory grid panel, a quest tracker card, a small circular minimap,
a currency counter, a level progress bar.
Rounded corners, soft shadows, clear iconography, no readable text, no lettering.
```

---

## 3. Style Blocks (เอาไปต่อท้าย Base Scene ทีละอัน)

### A — Soft Pastel Low-Poly 3D *(ปลอดภัยที่สุด, cozy ชัดเจน)*
```
Low-poly 3D render, soft rounded shapes, matte clean materials,
pastel palette of cream, sage green, dusty pink, and pale blue,
soft ambient occlusion, gentle diffuse lighting, no harsh shadows,
subtle depth of field, miniature diorama feel, high-quality render.
```

### B — Pixel Art *(ทำ animation ง่าย, ต้นทุน asset ต่ำ)*
```
High-resolution isometric pixel art, tile-based, limited palette of 32 warm colors,
crisp dithering, sharp pixels with no anti-aliasing, strong readable silhouettes,
retro handheld game aesthetic.
```

### C — Flat Vector / Geometric *(สะอาด, ทำ UI ง่ายสุด, สเกลได้ไม่จำกัด)*
```
Flat vector illustration, bold geometric shapes, no gradients,
thick consistent outlines, limited six-color palette, high contrast,
generous negative space, modern editorial illustration style.
```

### D — Watercolor Storybook *(อบอุ่น, แตกต่างจากตลาด, แต่คุม consistency ยาก)*
```
Soft watercolor painting, visible paper texture, loose ink linework,
muted earthy palette, gentle color bleeds, hand-drawn imperfect edges,
children's picture book illustration, warm and nostalgic.
```

### E — Anime Cel-Shaded *(จับกลุ่มเอเชีย/วัยรุ่นได้ดี)*
```
Anime cel-shaded illustration, clean linework, flat shading with hard shadow edges,
vibrant but soft palette, expressive character faces, light bloom,
modern Japanese slice-of-life aesthetic.
```

### F — Neon Night / Lo-fi *(ตรงกับ vibe บาร์/กลางคืนมากที่สุด)*
```
Moody night scene, neon signage glowing pink and cyan, warm interior light
spilling onto wet pavement, base palette of dark teal and deep purple,
soft glow and bloom, film grain, lo-fi chill aesthetic, cinematic contrast.
```

### G — Claymation Diorama *(จดจำง่ายมาก, screenshot-worthy สูง)*
```
Claymation stop-motion look, handmade plasticine texture with visible fingerprints,
tactile felt and cardboard materials, tilt-shift miniature effect,
warm studio lighting, shallow depth of field, physical model photography.
```

### H — Bangkok Urban Cozy *(differentiator ตรงกับ reference Seen Space)*
```
Contemporary Southeast Asian urban aesthetic, warm terracotta and cream concrete,
tropical plants like monstera and banana leaves, corrugated metal awnings,
blank hand-painted shop sign boards, humid golden hour light,
dense layered street details, no readable text.
```

---

## 4. ตัวอย่าง Prompt เต็ม (copy ไปวางได้เลย)

**Hero shot × Style A**
```
Isometric view of a small three-story community mall on a quiet urban street corner. Ground floor: an open café with outdoor tables, chairs, and a vending machine near the entrance. Second floor: small boutique shops with glass storefronts and awnings. Rooftop: a garden terrace with string lights and benches. A blank billboard panel on the side wall. Potted plants along the walkway. A few small stylized people walking, sitting, and chatting. Clean readable composition, no readable text, no lettering. Low-poly 3D render, soft rounded shapes, matte clean materials, pastel palette of cream, sage green, dusty pink, and pale blue, soft ambient occlusion, gentle diffuse lighting, no harsh shadows, subtle depth of field, miniature diorama feel. --ar 16:9
```

**Bar interior × Style F**
```
Isometric cutaway view of a cozy small bar interior. A wooden counter with a bartender behind it, four round tables with chairs, drinks and small plates sitting on the tables, one waiter character carrying a tray walking between tables, shelves of bottles on the back wall, hanging lamps, plants in the corner. No readable text, no lettering. Moody night scene, neon signage glowing pink and cyan, warm interior light spilling onto wet pavement, base palette of dark teal and deep purple, soft glow and bloom, film grain, lo-fi chill aesthetic, cinematic contrast. --ar 16:9
```

**Item sheet × Style B**
```
Game item icon sheet on a plain neutral background, evenly spaced grid of 12 icons: iced coffee glass, cocktail, plate of noodles, small potted plant, wooden chair, table lamp, fish, shrimp, fishing rod, cardboard box, blank sign board, camera. Consistent scale, consistent three-quarter angle, consistent lighting across all icons, no readable text. High-resolution isometric pixel art, limited palette of 32 warm colors, crisp dithering, sharp pixels with no anti-aliasing, strong readable silhouettes. --ar 1:1
```

---

## 5. Negative Prompt (สำหรับเครื่องมือที่รองรับ เช่น SD/Flux)
```
blurry, low resolution, distorted anatomy, extra limbs, garbled text, watermark,
signature, cluttered composition, harsh contrast, gore, weapons, photorealistic skin,
oversaturated, jpeg artifacts
```

---

## 6. เทคนิคคุมความสม่ำเสมอ

1. **ล็อกฉากก่อน แล้วค่อยสลับสไตล์** — gen Scene 1 ให้ครบทั้ง 8 สไตล์ก่อน แล้วเอามาวางเรียงเทียบ (คัดเหลือ 2-3 สไตล์) จากนั้นค่อย gen Scene 2-7 เฉพาะสไตล์ที่รอดเข้ารอบ
2. **ใช้ seed เดิม** (ถ้าเครื่องมือรองรับ) เพื่อให้ layout ใกล้เคียงกัน ต่างกันแค่สไตล์
3. **ใช้ style reference** — พอเจอภาพที่ชอบแล้ว ให้ใช้ภาพนั้นเป็น reference ในการ gen ภาพถัดๆ ไป (Midjourney มี `--sref`, ตัวอื่นมี image-to-image / IP-adapter)
4. **gen ทีละ 4 ภาพต่อ prompt** แล้วเลือกอันดีสุด อย่าตัดสินสไตล์จากภาพเดียว
5. **เก็บ prompt ที่เวิร์กไว้ในไฟล์** พร้อม seed/พารามิเตอร์ จะได้ทำซ้ำได้

---

## 7. Checklist ตัดสินใจเลือกสไตล์

ให้คะแนนแต่ละสไตล์ 1-5 ตามหัวข้อนี้ แล้วเลือกอันที่คะแนนรวมสูงสุด:

| เกณฑ์ | ทำไมถึงสำคัญกับโปรเจกต์นี้ |
|---|---|
| **อ่านออกตอนย่อเล็ก** | เกมเล่นบนเว็บ/มือถือ ต้องมองออกว่าอะไรคือร้าน อะไรคือโต๊ะ ตอนซูมออก |
| **Screenshot-worthy** | photo booth + การโชว์ร้าน คือ viral loop หลัก ภาพต้องน่าแชร์ |
| **ทำ asset ซ้ำได้สม่ำเสมอ** | ต้อง gen ไอเทมเป็นร้อยชิ้นให้ดูเป็นชุดเดียวกัน — สไตล์ painterly/3D render คุมยากกว่า flat/pixel มาก |
| **เหมาะกับ Phaser (2D engine)** | ต้องแปลงเป็น sprite sheet ได้ ถ้าเลือกสไตล์ 3D ต้อง pre-render เป็นภาพ 2D ก่อน (ทำได้ แต่เพิ่มขั้นตอน) |
| **ต้นทุน animation** | ต้องมีท่า: เดิน / ตกปลา / เสิร์ฟ / ถ่ายรูป — pixel & flat vector ถูกสุด, painterly & clay แพงสุด |
| **ผู้เล่นตกแต่งร้านเองแล้วยังสวย** | ผู้เล่นอัปโหลด texture เอง สไตล์ที่ "ทนของมั่ว" ได้ดีกว่าคือสไตล์ที่มีกรอบชัด (flat/pixel) |
| **ต่างจากตลาด** | เกม cozy ส่วนใหญ่เป็น pastel low-poly กับ pixel art — H (Bangkok urban) และ G (clay) โดดกว่า |

> **ข้อสังเกตเชิงปฏิบัติ:** ใช้ AI gen สำหรับ **ขั้นสำรวจสไตล์/concept** (ขั้นนี้) ได้เต็มที่ แต่ตอน production จริงควรให้ artist ทำ style guide + asset ชุดหลักจาก concept ที่เลือก เพราะปัญหาใหญ่สุดของ AI gen คือความสม่ำเสมอข้าม asset หลายร้อยชิ้น

---

## 8. Brand Direction Prompts (หลังเลือกสไตล์ได้แล้ว)

### Color Palette Exploration
```
Color palette swatch board, six harmonious color chips arranged in a row with soft rounded corners,
warm cozy mood suitable for a relaxing social game, neutral background, no text.
```

### Key Art (สำหรับหน้า landing / store)
```
Key art for a cozy social game: a warm three-story community mall at golden hour,
diverse small stylized characters hanging out on every floor — sipping drinks,
taking photos, fishing at a pond nearby, tending a rooftop garden.
Inviting, joyful, calm energy, no readable text, generous empty space in the upper third for a logo.
[+ Style Block ที่เลือก] --ar 16:9
```

### Logo Concept (ห้ามคาดหวังตัวอักษรจากโมเดล — เอาแค่ mark)
```
Minimal logo mark for a cozy community game, abstract symbol combining
a small building silhouette and a leaf, geometric and balanced, single color,
flat, centered on white background, no text, no lettering.
```

### App Icon
```
Mobile app icon for a cozy social game, single focal object centered,
simple readable at small size, soft gradient background, rounded square format,
no text. [+ Style Block ที่เลือก] --ar 1:1
```

---

## 9. ลำดับการทำจริง

- [ ] Gen **Scene 1 (Hero)** ครบทั้ง 8 สไตล์ → เรียงเทียบข้างกัน
- [ ] คัดเหลือ 2-3 สไตล์ ตาม Checklist ข้อ 7
- [ ] Gen **Scene 2, 4, 5** เฉพาะสไตล์ที่เข้ารอบ (เทสฉากภายใน + asset + ตัวละคร)
- [ ] เลือกสไตล์สุดท้าย 1 อัน
- [ ] Gen **Key Art + palette + app icon** ด้วยสไตล์นั้น
- [ ] รวมเป็น **style guide 1 หน้า** ส่งต่อให้ artist/dev ใช้อ้างอิงตอน production
