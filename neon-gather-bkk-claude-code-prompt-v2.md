# Neon Gather BKK — Claude Code Master Build Prompt (v2)

> รวมจาก `plan.md` + `claude-code-prompt.md` + `bar-social-design.md` + `asset-prompt-library.md`

**Neon Gather BKK** (ชื่อโปรเจกต์/slug: `neon-gather-bkk`) คือเว็บเกม cozy multiplayer แนว community mall ที่ผู้เล่นเช่าพื้นที่ปล่อยร้าน ตกแต่งเอง ขายของ/เทรดกัน มีมินิเกมตกปลา ระบบอาชีพ-เควสแบบไม่มี combat ระบบเสิร์ฟแบบบาร์จริง และชั้นความสัมพันธ์ทางสังคม (ของสะสม + ระบบแต้มหัวใจกับ NPC) ที่ทำให้ "นั่งเฉยๆ ในร้าน" กลายเป็นเรื่องสนุก

ไฟล์นี้รวมเนื้อหาจาก 4 เอกสารในโปรเจกต์ให้เป็น **prompt ชุดเดียวที่ครบที่สุด** สำหรับสั่ง Claude Code สร้างเกมทั้งหมดตั้งแต่ต้นจนจบ ใช้แทนไฟล์ `claude-code-prompt.md` เดิมได้เลย

> **อัปเดตหลักจากไฟล์เดิม**
> 1. เพิ่ม **Phase 2 ใหม่ทั้งหมด: Bar Social Layer & Collectibles** (coaster, tasting passport, ขาประจำ, ชนแก้ว, กิจกรรมมือว่าง, ระบบแต้มหัวใจ) — แทรกระหว่าง Community Depth กับ Scale & World Expansion **ทำให้เลขเฟสถัดจากนี้ขยับทั้งหมด** (ดูตารางด้านล่าง)
> 2. เพิ่มหมวด **Art & Grid Standards** ในทุก brief เพื่อให้ placeholder ทุกชิ้นมีขนาด/ชื่อไฟล์ตรงกับของจริงตั้งแต่ Phase 0 (สลับเป็น asset จริงทีหลังแบบ drop-in ได้โดยไม่ต้องแก้โค้ด)
> 3. ระบุ guardrail ของระบบแต้มหัวใจเป็น **กติกาเหล็กที่ต้อง enforce ด้วยโค้ด/DB constraint/test** ไม่ใช่แค่ตั้งใจไว้เฉยๆ

| เลขเฟสในไฟล์เดิม | เลขเฟสในไฟล์นี้ (v2) |
|---|---|
| Phase 0 — MVP | Phase 0 — MVP (เดิม + เพิ่ม moderation stub) |
| Phase 1 — Community Depth | Phase 1 — Community Depth (เดิม + note ผูกอนาคต) |
| *(ไม่มี)* | **Phase 2 — Bar Social Layer & Collectibles (ใหม่ทั้งหมด)** |
| Phase 2 — Scale & World Expansion | Phase 3 — Scale & World Expansion (เดิม + เพิ่ม Day/Night Cycle) |
| Phase 3 — B2B | Phase 4 — B2B (เดิม) |

> **วิธีใช้ (สรุปสั้น):** copy [0. Project Brief] + [0.1 Art & Grid Standards] วางหน้า prompt ทุกครั้ง แล้วต่อท้ายด้วยเนื้อหาของ "phase นั้น" วางใน Claude Code **ทีละ phase เท่านั้น** — ดูขั้นตอนละเอียดแบบทำตามได้จริง (ติดตั้ง, เริ่ม session, เช็กก่อนไป phase ถัดไป, troubleshoot) ในหัวข้อ **"วิธีใช้แบบละเอียด"** ด้านล่างสุดของสารบัญ

---

## สารบัญ
- **วิธีใช้แบบละเอียด (เริ่มที่นี่ถ้ายังไม่เคยใช้ Claude Code)**
- 0. Project Brief + กติกาเหล็ก (paste ทุก phase)
- 0.1 Art & Grid Standards (paste ทุก phase)
- 0.2 ความเสี่ยงที่ต้องติดตามตลอดโปรเจกต์ (บริบท)
- 0.3 ลำดับ Art Production คู่ขนานกับ Dev Phase (บริบท)
- Phase 0 — MVP: Core Loop
- Phase 1 — Community Depth
- Phase 2 — Bar Social Layer & Collectibles (ใหม่)
- Phase 3 — Scale & World Expansion
- Phase 4 — B2B / Real Business Layer
- Tips การใช้งานจริงกับ Claude Code

---

## วิธีใช้แบบละเอียด (เริ่มที่นี่ถ้ายังไม่เคยใช้ Claude Code)

### ขั้นที่ 1 — เตรียมเครื่องมือ (ทำครั้งเดียว)

1. **ติดตั้ง Claude Code** เลือกวิธีใดวิธีหนึ่ง:
   - macOS / Linux / WSL: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
   - Homebrew: `brew install --cask claude-code`
   - เช็คว่าติดตั้งสำเร็จด้วย `claude --version`
2. **Login** — รันคำสั่ง `claude` ครั้งแรก ระบบจะพาไป login ผ่านเบราว์เซอร์อัตโนมัติ (ต้องมีบัญชี Claude Pro/Max/
   Team/Enterprise หรือ Claude Console) หลัง login แล้วไม่ต้อง login ซ้ำอีก
3. **เครื่องมือของตัวโปรเจกต์เอง** (คนละส่วนกับ Claude Code): Node.js LTS, `pnpm` (`npm i -g pnpm`), Docker
   Desktop (สำหรับรัน PostgreSQL/Redis/MinIO ผ่าน docker-compose ที่ Claude Code จะสร้างให้ตั้งแต่ Phase 0),
   และ Git

### ขั้นที่ 2 — สร้างโปรเจกต์แล้วเริ่ม session แรก

```
mkdir neon-gather-bkk && cd neon-gather-bkk
git init
claude
```

พอรัน `claude` จะเข้าสู่หน้าต่างสนทนาโดยมีโฟลเดอร์ปัจจุบันเป็น "โปรเจกต์" ที่ Claude Code มองเห็นและแก้ไขได้

### ขั้นที่ 3 — ส่ง prompt Phase 0

พิมพ์/วางเป็นข้อความเดียว เรียงต่อกันตามนี้แล้วกด Enter:
`[0. Project Brief]` + `[0.1 Art & Grid Standards]` + `[เนื้อหา Phase 0 ทั้งหมด]`

### ขั้นที่ 4 — ปล่อยให้ทำงาน และตรวจทานระหว่างทาง

- โหมด default ของ Claude Code จะขออนุมัติก่อนแก้ไฟล์ทุกครั้ง — กด **Shift+Tab** เพื่อสลับโหมด:
  `acceptEdits` (อนุมัติอัตโนมัติ ทำงานไวขึ้น เหมาะกับ phase ที่ scope ชัดแบบไฟล์นี้) หรือ `plan` (ให้เสนอแผน
  ก่อนแตะไฟล์จริง เหมาะเวลาอยากตรวจสอบก่อนเริ่ม phase ใหม่)
- คุยแทรกได้ตลอดเวลาแบบพิมพ์คุยกับเพื่อนร่วมงาน เช่น "อธิบายว่า schema ตอนนี้หน้าตาเป็นยังไง" หรือขัดจังหวะ
  ถ้าเห็นว่ากำลังออกนอกเรื่อง

### ขั้นที่ 5 — เช็กว่า phase นี้ "เสร็จจริง" ก่อนไปต่อ (Definition of Done)

- [ ] `pnpm dev` รันขึ้นครบทุก app โดยไม่ error
- [ ] ทำ flow เต็มตามที่ระบุท้าย prompt ของ phase นั้นได้จริงด้วยตัวเอง (เช่น Phase 0: สมัคร -> เช่าพื้นที่ ->
      ตกปลา -> ขายของ)
- [ ] คำสั่งเทส (เช่น `pnpm test`) ผ่านทั้งหมด โดยเฉพาะเทสกติกาเหล็กใน Phase 2
- [ ] README.md / DECISIONS.md ที่อัปเดตแล้ว อ่านแล้วตรงกับที่ทำจริง
- Claude Code จะสรุปให้เองท้าย session อยู่แล้ว (มีคำสั่งนี้ต่อท้าย prompt ทุก phase) แต่ควรลองรันเองอีกรอบ
  ไม่ใช่เชื่อคำสรุปเฉยๆ

### ขั้นที่ 6 — Commit

พิมพ์ตรงๆ ในแชท: **"commit การเปลี่ยนแปลงทั้งหมดด้วย message ที่อธิบายชัดเจน"** — Claude Code คุยเรื่อง git
แบบภาษาคนได้ ไม่ต้องพิมพ์คำสั่ง git เอง (ถามได้ด้วยว่า "มีไฟล์ไหนเปลี่ยนบ้าง" ก่อน commit ถ้าอยากรีวิวก่อน)

### ขั้นที่ 7 — เริ่ม Phase ถัดไปเป็น "session ใหม่"

"Session ใหม่" ไม่ได้แปลว่าเริ่มโปรเจกต์ใหม่ — โค้ดยังอยู่ในโฟลเดอร์เดิมครบทุกไฟล์ แค่ทำให้บทสนทนาไม่ยาวจน
Claude Code เริ่มสับสนหรือลืมรายละเอียดต้นๆ เลือกวิธีใดวิธีหนึ่ง:
- พิมพ์ `/clear` ในหน้าต่างเดิม (ล้างประวัติแชท แต่ไฟล์ในโฟลเดอร์ยังอยู่ครบ) หรือ
- ปิดแล้วเปิดใหม่ด้วย `claude` ในโฟลเดอร์เดิม (เท่ากับ session ใหม่จริงๆ)

จากนั้นวาง `[0. Project Brief]` + `[0.1 Art & Grid Standards]` + `[เนื้อหา Phase ถัดไป]` อีกครั้ง (มีบรรทัด
"[บอกว่า Phase ก่อนหน้าเสร็จแล้ว]" กำกับไว้ในแต่ละ phase อยู่แล้ว) — Claude Code จะอ่านโค้ดที่มีอยู่จริงในโฟลเดอร์
เพื่อทำความเข้าใจเอง ไม่ต้องอธิบายเองว่ามีอะไรอยู่แล้วบ้าง

> ทางเลือกอื่น: ถ้าไม่อยาก `/clear` เพราะอยากให้ Claude Code จำบทสนทนาก่อนหน้าไว้ ใช้ `claude -c` เพื่อสาน
> conversation ล่าสุดต่อในโฟลเดอร์เดิมได้ แต่จะกิน context มากกว่า ไม่แนะนำถ้า phase ก่อนหน้ายาวมาก

### ถ้า Claude Code เสนอทางลัดที่ขัดกติกาเหล็ก

พิมพ์ตอบตรงๆ เช่น "ขัดกับกติกาเหล็กใน Project Brief ข้อ [X] ห้ามทำแบบนั้น" — Claude Code จะปรับตามทันที ไม่ต้อง
กลัวเสียมารยาทหรือทำให้งานช้าลง กติกาเหล็กมีไว้กันปัญหาที่แก้ยากทีหลังโดยเฉพาะ

### ถ้าติดตั้งไม่ผ่าน หรือเจอ error

พิมพ์ถาม Claude Code ตรงๆ ในหน้าต่างสนทนาได้เลย เช่น "install Claude Code แล้ว error ว่า [ข้อความ error]" —
Claude Code ตอบเรื่องตัวเองได้แม่นยำ (ดึงข้อมูลจาก doc จริงของ Anthropic) หรือดูเพิ่มที่
https://code.claude.com/docs/en/troubleshoot-install

### ถ้าไม่อยากใช้ terminal

ใช้ Claude Code ผ่าน Desktop app หรือ VS Code/JetBrains extension ก็ได้ workflow เดียวกันทุกอย่าง (Project
Brief, การแบ่ง phase, การเช็ก Definition of Done) แค่ UI ต่างจาก CLI เท่านั้น หรือ dispatch งานจากมือถือผ่าน
Claude app แล้วให้รันบน cloud session ก็ได้เช่นกัน

---

## 0. Project Brief + กติกาเหล็ก (ใส่หน้า prompt ทุก phase เสมอ)

```
โปรเจกต์: Neon Gather BKK (slug: neon-gather-bkk) — เว็บเกม cozy multiplayer แนว community mall
- ผู้เล่นเช่าพื้นที่/บล็อกร้าน ตกแต่งเอง ขายของ เทรดกัน
- มีมินิเกมตกปลา/ตกกุ้ง (กดเอง + auto/idle)
- ระบบอาชีพ-เลเวล-เควส (ไม่มี combat/damage ใดๆ ทั้งสิ้น)
- ระบบโต๊ะ: สั่ง → เสิร์ฟ → เก็บ (เหมือนบาร์จริง) มี auto-serve bot และผู้เล่นเป็นพนักงานได้
- ตู้กดอัตโนมัติ, บูธถ่ายรูป, ตึกหลายชั้น (ลิฟต์/บันได)
- ชั้นความสัมพันธ์สังคม: ของสะสม (coaster ฯลฯ), สถานะขาประจำ, กิจกรรมมือว่าง,
  และ "ระบบแต้มหัวใจ" กับ NPC ตัวละครหลัก (ห้ามใช้กับผู้เล่นจริงเด็ดขาด — ดูกติกาเหล็กด้านล่าง)
- Phase หลังสุดมีระบบธุรกิจจริงมาลงโฆษณา/เมนู (ทำเมื่อมี user base จริงแล้วเท่านั้น)

Core pillars (ใช้ตัดสินใจเวลา brief ไม่ครอบคลุมจุดใดจุดหนึ่ง):
async-first (ไม่ต้อง real-time hardcore) / player-driven economy / screenshot-worthy (viral loop) /
phased complexity (เริ่มเล็กค่อยขยาย)

Tech stack (fixed ไว้แล้ว ห้ามเปลี่ยนโดยไม่ถาม):
- Client: Phaser.js 3.x (TypeScript) — 2.5D isometric, Bangkok Urban Cozy art style
- Frontend shell (login, dashboard, marketplace, album): React + Next.js (TypeScript)
- Backend API: Node.js + NestJS (TypeScript)
- Realtime: Socket.io (WebSocket)
- Database: PostgreSQL (Prisma ORM)
- Cache/session/leaderboard: Redis
- Asset/File storage: S3-compatible (MinIO ตอน dev, Cloudflare R2 ตอน production)
- Auth: JWT + refresh token
- Monorepo: Turborepo (apps/game, apps/web, apps/api, packages/shared-types)
- Package manager: pnpm

กติกาการทำงานของ Claude Code (ทุก phase):
1. สร้าง/ต่อยอด monorepo เดียว ห้ามแยก repo
2. ทุก phase ต้องรันได้จริงด้วย `pnpm dev` และเทสได้ทันทีก่อนไป phase ถัดไป
3. เขียน TypeScript strict mode ทุกที่ ห้ามใช้ any พร่ำเพรื่อ
4. ทุก API endpoint ต้องมี input validation (zod หรือ class-validator)
5. เขียน unit test พื้นฐานสำหรับ business logic ทุก phase (เงิน, XP, rarity, แต้มหัวใจ ฯลฯ)
6. เขียน/อัปเดต README.md อธิบายวิธีรันในทุก phase ที่เพิ่ม
7. เขียน/อัปเดต DECISIONS.md บันทึกทุกครั้งที่เลือก library/pattern สำคัญ
8. Commit เป็นก้อนเล็กๆ พร้อม message อธิบายชัดเจน
9. แต้มเงิน/XP/รางวัลทุกชนิดต้องคำนวณฝั่ง server เท่านั้น ห้ามเชื่อค่าที่ client ส่งมา
10. Entity ที่เสี่ยง race-condition/duplicate (เช่น การรับของสะสม) ต้องมี unique constraint ระดับ DB
    ไม่ใช่เช็กแค่ฝั่ง application

⚠️ กติกาเหล็กที่ยืนอยู่ตลอดทั้งโปรเจกต์ (ต้องรู้ตั้งแต่ Phase 0 แม้ยังไม่ได้ implement):
- ห้ามมีระบบ "ความสัมพันธ์/แต้มหัวใจ" ใดๆ ที่ผูกกับ **ผู้เล่นจริง** เด็ดขาด — ใช้ได้กับ NPC ที่ทีมออกแบบเอง
  เท่านั้น (มาใน Phase 2) ถ้ามีการออกแบบ entity ตัวละครร่วมกันระหว่างผู้เล่นกับ NPC ให้แยก table/schema
  ให้ขาดจากกันตั้งแต่ต้น เพื่อไม่ให้ระบบแต้มหัวใจ "เผลอ" ไปผูกกับ user account จริงได้ในทางเทคนิค
- ห้ามขายแต้มหัวใจ/currency พิเศษด้วยเงินจริงโดยตรง (ความเสี่ยงกฎหมาย gacha/loot box)
- ห้ามมีระบบ combat/damage ใดๆ ในเกมนี้
- ถ้าเปิดให้ผู้เล่นอัปโหลด texture/รูปได้เมื่อไหร่ ต้องมี content moderation stub อย่างน้อย (แม้เป็น manual
  queue ธรรมดา) ตั้งแต่ phase ที่เปิดฟีเจอร์นั้น ห้ามเลื่อนไปทำทีหลัง
```

---

## 0.1 Art & Grid Standards (แนบคู่กับ Brief ทุก phase ที่แตะเรื่องภาพ/ขนาด)

```
สไตล์ที่ล็อกแล้ว: "Bangkok Urban Cozy" — isometric 2:1, เส้น outline หนาสม่ำเสมอ, flat color + shading เบา,
โทนสี terracotta/warm cream/forest-green/teak/teal + neon accent เฉพาะ layer กลางคืน
(อ้างอิงเต็มใน asset-prompt-library.md เวลาต้อง generate asset จริง)

Grid & Scale (ห้ามเปลี่ยนกลางทาง — ให้ placeholder ทุกชิ้นตรงตามนี้ตั้งแต่ Phase 0):
- Iso tile ฐาน: 128 × 64 px (หน่วยวัดของทุกอย่างในเกม)
- Plot ร้านเช่า (4×4 tile): footprint 512 × 256 px
- ความสูงตัวละคร: ~110 px (≈1.7 tile)
- โต๊ะ/เก้าอี้: footprint 1 tile, โต๊ะสูง ~50px
- ตู้กดอัตโนมัติ: footprint 1 tile, สูง ~150px
- บูธถ่ายรูป: footprint 2×2 tile, สูง ~200px
- ความสูงต่อชั้นตึก: 256 px
- Item icon: source 512×512 (ย่อใช้จริง 128×128 ใน UI)
- Coaster: 256×256
- Portrait NPC (heart system): 1024×1536
- ภาพพิเศษ heart level 10: 1920×1080
- Ad banner slot (Phase 4): 512×256

Naming convention ของไฟล์ asset (ใช้ตั้งแต่ placeholder แรก เพื่อสลับเป็นของจริงภายหลังแบบ drop-in):
env_*     สภาพแวดล้อม/สถาปัตยกรรม      เช่น env_facade_a_01.png
prop_*    เฟอร์นิเจอร์/props            เช่น prop_table_round_01.png
icon_*    ไอคอนไอเทม                   เช่น icon_drink_coffee_iced.png
char_*    ตัวละครผู้เล่น                เช่น char_avatar_base_walk_s.png
npc_*     NPC ระบบหัวใจ (Phase 2)       เช่น npc_mina_portrait_smile.png
ui_*      UI                           เช่น ui_panel_rounded.png
vfx_*     เอฟเฟกต์                     เช่น vfx_ripple_sheet.png
emis_*    emissive layer กลางคืน        เช่น emis_neon_pink_bar.png
coaster_* ของสะสม coaster              เช่น coaster_shop012_opening.png

สถาปัตยกรรม rendering (ตัดสินใจตั้งแต่ Phase 0 แม้ยังไม่ใช้จริงจนถึง Phase 3):
- ห้าม gen/ทำ asset สภาพแวดล้อมสองชุด (กลางวัน-กลางคืน) — asset โลกเกมทุกชิ้นเป็น "กลางวันแบบ neutral" ชุดเดียว
- โหมดกลางคืนทำด้วย (1) tint overlay สีน้ำเงินเขียวทับทั้งฉากด้วย multiply blend mode
  และ (2) emissive layer แยก (ไฟหน้าต่าง/นีออน) วางทับแบบ additive blend
- scene/layer system ใน Phaser ต้องออกแบบให้รองรับการวาง overlay 2 ชั้นนี้ตั้งแต่โครงสร้างแรก
  (ไม่ต้อง implement เต็มจนถึง Phase 3 แต่ห้ามออกแบบจนรื้อยาก)
- Asset ทุกชิ้นที่วางในโลกเกม ห้ามมีเงาบนพื้น bake ติดมา (Phaser วาด contact shadow แยกเป็น sprite เดียว
  ใช้ร่วมกันทุกชิ้น)

ถ้า Claude Code มีเครื่องมือ generate ภาพต่อให้ใช้งานได้ ให้อ้างอิง Style DNA + Tech Spec ต่อประเภท asset
จากไฟล์ asset-prompt-library.md เต็มรูปแบบ (มี prompt สำเร็จรูปแยกตามหมวด A-I พร้อม style reference)
ถ้ายังไม่มีเครื่องมือ generate ภาพ ให้สร้าง placeholder เป็นสี่เหลี่ยม/รูปทรงเรียบง่ายที่ "ขนาดและชื่อไฟล์"
ตรงตาม spec ข้างต้นเป๊ะ
```

---

## 0.2 ความเสี่ยงที่ต้องติดตามตลอดโปรเจกต์ (บริบท — ไม่ต้อง paste ก็ได้ แต่แนะนำให้รู้ไว้)

- **Content moderation** ต้องพร้อมตั้งแต่ phase ที่เปิดอัปโหลด texture/รูปครั้งแรก (Phase 0) — ห้ามเลื่อนไปทำทีหลัง
- **Economy balance** (เงินเฟ้อ, ค่าเช่า, ราคาของสะสม) ต้องมี sink/source design ชัดเจนตั้งแต่ต้น
- **App Store/Play Store policy** เรื่องโฆษณา/ลิงก์นอกแอป/เงินจริง — เช็กก่อนเข้า Phase 4 (เว็บไม่ติด policy
  แบบ mobile store แต่ยังต้องเช็ก GDPR/PDPA เรื่องเก็บ user data สำหรับ ads)
- **Chicken-and-egg สำหรับ B2B ads** — ต้องมี user base มากพอก่อนขายโฆษณาได้จริง (Phase 4 ทำเมื่อพร้อมจริงเท่านั้น)
- **Heart System กลืนโฟกัสของเกม** — ถ้าคนสนใจแต่จีบ NPC จนไม่สนใจร้าน/ผู้เล่นด้วยกันเอง community จะตาย
  ต้องคุมสัดส่วน reward ให้ระบบผู้เล่น-ผู้เล่นยังคุ้มกว่าเสมอ (tuning knob ที่ต้องเผื่อไว้ตั้งแต่ Phase 2)
- **ต้นทุน art ต่อ season ของ Heart System** — ตัวละคร 1 คน = งานวาดหลายชิ้น (portrait 6-8 สีหน้า, sprite,
  ภาพพิเศษ) ต้องมีรายได้รองรับก่อนขยาย cast อย่ารีบเปิดหลายตัวละครพร้อมกันในรอบแรก
- **เส้นแบ่ง NPC/ผู้เล่นจริงเบลอ** — ถ้า UI ไม่ชัด ผู้เล่นอาจเผลอปฏิบัติกับคนจริงเหมือน NPC (ดู guardrail Phase 2)

## 0.3 ลำดับ Art Production คู่ขนานกับ Dev Phase (บริบท)

งาน art (โดยเฉพาะตัวละคร) ใช้เวลานานกว่างานโค้ดมาก ควรเริ่มคู่ขนานล่วงหน้า ไม่ใช่รอให้ dev phase นั้นเริ่มก่อนค่อยจ้าง:

| Dev Phase | Art ที่ต้องพร้อมก่อน/ระหว่างเฟส |
|---|---|
| Phase 0 | พื้น tileable, facade 3 แบบ, โต๊ะ-เก้าอี้, ชุดต้นไม้, UI kit เบื้องต้น, ไอคอนเครื่องดื่ม/ปลา |
| Phase 1 | ตู้กด, บูธถ่ายรูป, **ส่ง avatar concept ให้นักวาดจริงตั้งแต่ตอนนี้** (ใช้เวลานาน รอไม่ทันถ้าเริ่มช้า) |
| Phase 2 | Coaster template, ตู้โชว์, กิจกรรมมือว่าง, **เริ่มบรีฟ guest artist สำหรับ NPC ตัวแรกตั้งแต่ปลาย Phase 1** (portrait 6-8 สีหน้า + sprite ใช้เวลานานสุดในทั้งโปรเจกต์) |
| Phase 3 | ลิฟต์/บันได, emissive layer สำหรับ day/night cycle |
| Phase 4 | บิลบอร์ด/จอ LED/กรอบโปสเตอร์เปล่า (ต้องเว้น safe area ให้ตรงสัดส่วน 512×256) |

> Prompt สำเร็จรูปสำหรับ generate asset แต่ละชิ้น (Style DNA, tech spec ต่อประเภท, negative prompt, workflow
> คุมความสม่ำเสมอ) อยู่ครบใน `asset-prompt-library.md` — ถ้า Claude Code เชื่อมต่อเครื่องมือ generate ภาพได้
> ให้ดึง prompt จากไฟล์นั้นมาใช้ตรงๆ ตามหมวด A-I

---

## Phase 0 — MVP: Core Loop

```
[ใส่ Project Brief + Art & Grid Standards ด้านบนก่อนเสมอ]

ตอนนี้ทำ Phase 0 (MVP) เท่านั้น เป้าหมายคือ prove core loop ให้เร็วที่สุด

สร้าง monorepo โครงสร้างนี้:
apps/
  game/       -> Phaser.js + Vite + TypeScript
  api/        -> NestJS + Prisma + PostgreSQL
  web/        -> Next.js (แค่หน้า login/register + embed game canvas)
packages/
  shared-types/ -> TypeScript interfaces ที่ game/api ใช้ร่วมกัน

ทำฟีเจอร์ต่อไปนี้ให้ครบและรันได้จริง:

1. Auth ระบบพื้นฐาน
   - Register/Login ด้วย email+password (JWT)
   - Guest mode (เล่นได้โดยไม่ต้องสมัคร ผูก session ชั่วคราว)

2. World/Map ชั้นเดียว
   - Tilemap isometric ขนาด tile 128×64 ตาม Art & Grid Standards (เลือก isometric หรือ top-down
     ถ้า top-down ทำง่ายกว่าใน Phaser จริงๆ ให้อธิบายเหตุผลที่เลือกและบันทึกไว้ใน DECISIONS.md)
   - Avatar เดินได้ด้วย arrow key/WASD, ความสูง sprite ~110px, sync ตำแหน่งผ่าน Socket.io

3. ระบบเช่าพื้นที่ (Plot System)
   - Grid บล็อกขนาดเท่ากัน (4×4 tile ต่อบล็อก = footprint 512×256 px)
   - API: GET /plots, POST /plots/:id/rent
   - แสดงสถานะบล็อกในเกม (ว่าง/มีคนเช่า/ของฉัน)

4. Template facade แบบง่าย + Content Moderation Stub
   - 3 แบบ template หน้าร้านตายตัว — สร้าง placeholder sprite ตาม naming convention
     (เช่น env_facade_a_01.png, env_facade_b_01.png, env_facade_c_01.png) ขนาดตรงกับ plot footprint
   - อัปโหลด texture ทับ slot ที่กำหนด (เก็บไฟล์ที่ MinIO)
   - เนื่องจากเปิดอัปโหลดไฟล์จากผู้เล่นแล้วใน phase นี้ ต้องมี moderation stub ขั้นต่ำ: endpoint ตรวจสอบไฟล์
     เบื้องต้น (ขนาด/ชนิดไฟล์) + flag สถานะ "pending_review" ก่อนแสดงผลจริง แม้ยังไม่ต่อ 3rd-party
     moderation API จริงในเฟสนี้ (มาต่อ Rekognition/Vision จริงใน Phase 4)

5. ไอเทม + Marketplace พื้นฐาน
   - Schema: Item (id, name, price, category, thumbnail_url, owner_id) — thumbnail spec 512×512 source
   - API: CRUD สินค้า, ซื้อขายพื้นฐาน (โอนเงินในเกมระหว่าง user, ต้องมี transaction/ledger table กันเงินหาย)

6. มินิเกมตกปลาแบบกดเอง
   - Timing bar mechanic ง่ายๆ 1 บ่อ (ท่าเรือ, footprint ตาม spec)
   - ปลามี rarity 3 ระดับ (common/rare/legendary) สุ่มตาม weight
   - เก็บผลลัพธ์ลง inventory ผู้เล่น
   - ออกแบบ schema เผื่อโหมด "idle/auto" ที่จะเพิ่มใน Phase 2 (เช่น field รองรับสถานะ "รอผล" แบบไม่ต้องอยู่
     หน้าจอ) แต่ **ยังไม่ต้อง implement โหมด idle ในเฟสนี้**

7. โต๊ะ + Auto-serve bot (ไม่มี NPC เดินตอนนี้)
   - Table state: empty -> ordered -> served -> collected (auto despawn หลังเวลาหนึ่ง)
   - แสดง object บนโต๊ะจริงในเกม (ใช้ sprite ง่ายๆ)
   - ตั้งชื่อ entity/model ว่า "AutoServeBot" — **ห้ามใช้ชื่อ "NPC" เฉยๆ** เพราะใน Phase 2 จะมี "StaffNPC"
     (ตัวละครมีชื่อ มีตารางกะ มีบทสนทนา) ซึ่งเป็นคนละ concept กันโดยสิ้นเชิง ต้องแยกชื่อ entity ให้ชัดตั้งแต่
     ต้นเพื่อไม่ให้สับสน/ชนกันตอน implement Phase 2

8. Leaderboard พื้นฐาน
   - ใช้ Redis sorted set เก็บคะแนนตกปลา (น้ำหนัก/จำนวน)
   - แสดงผล top 10 รายสัปดาห์

ให้ Claude Code:
- เขียน Prisma schema ให้ครบทุก entity ที่ใช้ใน phase นี้
- Seed ข้อมูลตัวอย่าง (mock users, plots, items) สำหรับทดสอบ
- เขียน docker-compose.yml สำหรับ PostgreSQL + Redis + MinIO (dev environment)
- จบด้วยสรุปว่าไฟล์ไหนสำคัญที่สุด และวิธีทดสอบ flow เต็ม (สมัคร -> เช่าพื้นที่ -> ตกปลา -> ขายของ)
```

---

## Phase 1 — Community Depth

```
[ใส่ Project Brief + Art & Grid Standards ด้านบนก่อนเสมอ]
[บอก Claude Code ว่า Phase 0 เสร็จแล้ว ให้ต่อยอดจากโค้ดเดิม ไม่ใช่เขียนใหม่]

ทำ Phase 1 ต่อจาก Phase 0 เพิ่มฟีเจอร์ต่อไปนี้:

1. ระบบอาชีพ (Job/Class System แบบไม่มี combat)
   - อาชีพ: Fisher, Farmer, Crafter, Merchant, Explorer
   - แต่ละอาชีพมี XP แยก, เลเวลอัพปลดล็อก perk (ไม่ใช่ damage stat) เช่น Fisher เลเวลสูง = โอกาสได้ปลาหายาก
     เพิ่ม, inventory ใหญ่ขึ้น
   - Schema: PlayerJob (player_id, job_type, xp, level)
   - Skill tree เบาๆ ต่อ job (3 กิ่งย่อยต่ออาชีพก็พอ)

2. ระบบเควส
   - Quest table: main quest, job quest, daily/weekly quest
   - Quest tracker UI ใน game canvas (การ์ดโค้งมน เงานุ่ม ตาม TECH-UI spec)
   - Community quest (server-wide goal, progress bar รวมทุกคน)

3. AutoServeBot (ต่อยอดจาก Phase 0 — อย่าตั้งชื่อว่า "NPC" เพื่อไม่ให้ชนกับ StaffNPC ใน Phase 2)
   - Pathfinding แบบง่าย (grid-based A* หรือ library เช่น easystar.js)
   - State machine: idle -> เดินไปโต๊ะที่มีของค้าง -> เก็บ -> เดินกลับจุดเริ่ม

4. ระบบพนักงานผู้เล่นจริง (Job board)
   - เจ้าของร้านโพสต์ตำแหน่งงาน (ค่าจ้าง/สัดส่วนรายได้)
   - ผู้เล่นสมัครงาน ได้รับ notification เมื่อมีออเดอร์ใหม่ในร้านที่ทำงานอยู่
   - ระบบทิป (ผู้เล่นให้ทิปพนักงานหลังรับบริการ)
   - **หมายเหตุสำคัญ:** นี่คือความสัมพันธ์ระหว่างผู้เล่นกับผู้เล่น ต้องมีแค่ ทิป/เพื่อน/รีวิว/เรตติ้ง เท่านั้น
     ห้ามมี "แต้มหัวใจ" หรือระบบความสัมพันธ์แบบสะสมเลเวลใดๆ ผูกกับ entity ประเภทผู้เล่นจริงเด็ดขาด (กติกาเหล็ก)

5. ตู้กดอัตโนมัติ (Vending Machine)
   - วางเป็น object แยกจากบล็อกร้านเต็ม (footprint 1×1 tile, สูง ~150px ตาม spec)
   - ซื้อ -> animation ของหล่น -> เก็บเข้า inventory
   - เจ้าของต้อง restock (API endpoint + UI แจ้งเตือนของหมด)

6. บูธถ่ายรูป (Photo Booth)
   - เข้าไปยืนในกรอบ -> เลือก background/pose -> capture canvas เป็นรูปภาพ (Phaser render texture หรือ
     html2canvas)
   - เก็บรูปใน S3/MinIO ผูกกับ user, มีหน้า "อัลบั้ม" ใน Next.js web app
   - ปุ่ม share (generate shareable link/image URL)
   - ออกแบบ schema ตาราง Photo ให้มี field เผื่อรองรับภาพพิเศษจากระบบแต้มหัวใจใน Phase 2 เช่น
     photo_type: 'booth' | 'heart_special' — ยังไม่ต้อง implement ส่วน heart_special ตอนนี้

ให้ Claude Code อัปเดต Prisma schema เพิ่ม entity ใหม่ทั้งหมด และเขียน migration แยกจาก Phase 0
ทดสอบว่าไม่พังของเดิม (regression check บน flow หลักของ Phase 0)
```

---

## Phase 2 — Bar Social Layer & Collectibles (ใหม่)

```
[ใส่ Project Brief + Art & Grid Standards ด้านบนก่อนเสมอ]
[บอกว่า Phase 0-1 เสร็จแล้ว ต่อยอดจากโค้ดเดิม — Phase นี้เพิ่ม "ชั้นความสัมพันธ์ทางสังคม" ให้ระบบบาร์]

หลักคิดของ phase นี้ (อ่านก่อนเริ่มเขียนโค้ด): ของสะสมสายบาร์ต้องพิสูจน์ "คุณเคยอยู่ตรงนั้นกับใคร ตอนไหน"
ไม่ใช่ฝีมือ/ดวงแบบของสะสมสายตกปลา กติกาเหล็ก: ของสะสมสายบาร์ต้องได้มา "เมื่อมีคนอื่นอยู่ด้วยเท่านั้น"
ถ้าฟาร์มคนเดียวได้เมื่อไหร่ ความเป็น community จะพังทันที

ทำฟีเจอร์ต่อไปนี้ **ตามลำดับ อย่าข้าม** เพราะแต่ละอันพึ่งพาของก่อนหน้า:

1. Coaster + Opening Night Coaster (ทำก่อนสุด — ต้นทุนต่ำสุด ได้ผลเยอะสุด)
   - Schema: Coaster (id, shop_id, image_url, tier, season, issued_at)
            PlayerCoaster (player_id, coaster_id, obtained_at) — ต้องมี UNIQUE constraint ระดับ DB
            บน (player_id, coaster_id)
   - Tier: standard (สั่งเมนูอะไรก็ได้ที่ร้านนั้นครั้งแรก), seasonal (ช่วงอีเวนต์), regular (ครบสถานะ
     ขาประจำ — ดูข้อ 2), opening_night (เฉพาะ 7 วันแรกนับจาก shop.opened_at เช็คด้วย server time เท่านั้น
     พ้น 7 วันแล้วต้องหายไปตลอดกาล ห้ามมีทางเปิดรับใหม่ได้อีก)
   - ต้องมี cap จำนวน coaster ที่ร้านหนึ่งแจกได้ต่อ season (ทำเป็นค่า config ปรับได้ ไม่ hardcode) เพื่อกัน
     coaster เฟ้อจนไร้ค่า
   - ใช้ template slot ขนาด 256×256 (ตาม Art & Grid Standards) เพิ่มในระบบอัปโหลด texture ที่มีอยู่แล้วจาก
     Phase 0 (เจ้าของร้านออกแบบลายเอง ผ่าน content moderation stub เดียวกัน) เทรดได้ผ่าน marketplace เดิม
   - เพิ่ม Display Cabinet: furniture object วางในร้าน/หน้าโปรไฟล์ โชว์ coaster ทั้งหมดที่เก็บได้

2. สถานะขาประจำ (Regular) + ชนแก้ว (Cheers Log)
   - RegularStatus (player_id, shop_id, menu_item_id, order_count, achieved_at) — สั่งเมนูเดิมที่ร้านเดิม
     ครบ 20 ครั้งพอดี ปลดล็อก title "ขาประจำร้าน…" (counter เพิ่มทุกครั้งที่ order สำเร็จ)
   - CheersLog (player_id_a, player_id_b, first_cheers_at, total_count) — ปุ่ม "ชนแก้ว" ใช้ได้เฉพาะกับ
     ผู้เล่นอื่นที่ online อยู่โต๊ะ/ระยะเดียวกันจริงในขณะนั้นเท่านั้น (enforce ฝั่ง server ด้วยการเช็ค session
     และตำแหน่งปัจจุบัน ห้ามชนแก้วกับ NPC หรือคนที่ไม่ได้อยู่ตรงนั้นจริง)

3. สมุด Tasting Passport
   - TastingStamp (player_id, menu_item_id, first_tried_at)
   - แสดง % ความคืบหน้าเทียบกับจำนวนเมนูทั้งหมดในระบบตอนนั้น (เมนูเป็นของที่ผู้เล่นสร้างเองอยู่แล้วจาก
     Phase 0/1 — passport นี้จึงโตเองตามจำนวนร้านโดยไม่ต้องเพิ่ม content เอง)

4. เชื่อมระบบตกปลาแบบ idle เข้ากับการนั่งบาร์ + ทางลัดไป "รับกะ"
   - เพิ่มโหมด "วางเบ็ด/กับดักแบบ auto/idle" ให้มินิเกมตกปลาจาก Phase 0 — ผู้เล่นวางเบ็ดที่ท่าเรือแล้วเดิน
     ออกไปนั่งบาร์ได้เลย ระบบคำนวณผลลัพธ์อัตโนมัติเมื่อกลับมาเก็บ ไม่ต้องอยู่หน้าจอรอ
   - นี่คือจุดที่ทำให้ "นั่งเฉยๆ ที่บาร์" กลายเป็นช่วงเวลาที่มี progress เดินอยู่เบื้องหลัง
   - ถ้าผู้เล่นเบื่อระหว่างรอ ให้โชว์ทางลัดไปหน้า Job board (มีอยู่แล้วจาก Phase 1) เพื่อรับกะเสิร์ฟได้ทันที
     ไม่ต้องสร้างระบบใหม่ แค่เชื่อม UX ให้เห็นตัวเลือกนี้ระหว่างนั่งอยู่ในบาร์

5. กิจกรรมมือว่าง (Idle Activities) — เกณฑ์: หยุดกลางคันได้เสมอ, รอบละ 1-2 นาที, ไม่แย่งความสนใจจากบทสนทนา
   - ปาเป้า / ทอยเต๋า / ไพ่ง่ายๆ — แข่งเบาๆ ที่โต๊ะกับผู้เล่นอื่น
   - ตู้คีบตุ๊กตา/กาชาปอง — สุ่มได้สติกเกอร์/coaster ป้อนกลับเข้าระบบสะสมข้อ 1
   - ตู้อาร์เคดมุมร้าน — leaderboard แยกต่อร้าน (Redis sorted set ต่อ shop_id)
   - Jukebox — ผู้เล่นอัปโหลดเสียง/เพลง chiptune ที่แต่งเองเท่านั้น เปิดให้ทั้งร้านฟัง **ห้ามรองรับเพลง
     ลิขสิทธิ์เด็ดขาด** ต้องมีข้อความยืนยันสิทธิ์ก่อนอัปโหลดทุกครั้ง + ผ่าน moderation stub
   - เรื่องเล่าจากบาร์เทนเดอร์ — AutoServeBot/StaffNPC เล่าเกร็ดสุ่ม 1 ชิ้นต่อการแวะร้าน เก็บเป็นสมุดสะสม
     บางเรื่องปลดล็อกเฉพาะดึก/เฉพาะตอนโต๊ะเต็ม

6. ★ ระบบแต้มหัวใจ (Heart System) — ทำ NPC ตัวเดียวให้ครบทุกกลไกก่อนเท่านั้น

   ⚠️⚠️ กติกาเหล็กของระบบนี้ ต้อง enforce ด้วยโครงสร้างโค้ด ไม่ใช่แค่ comment ในเอกสาร:
   a) ผูกได้กับ entity จากตาราง StaffNPC เท่านั้น ห้าม foreign key ชี้ผู้เล่นจริงเด็ดขาด — ออกแบบ schema
      ให้ "เป็นไปไม่ได้ทางเทคนิค" ที่จะสร้างความสัมพันธ์แบบนี้กับ user account จริง ไม่ใช่แค่ validate ตอน
      runtime
   b) ห้ามมี endpoint ที่แลกเงินจริงเป็น heart point โดยตรง (เสี่ยงกฎหมาย gacha/loot box) ถ้ารู้สึกว่าต้อง
      implement ทางลัดแบบนี้ ให้หยุดและถามก่อน อย่าเพิ่มเอง
   c) เนื้อหาต้อง wholesome/all-ages ทั้งหมด ตัวละครทุกตัวต้องระบุชัดว่าเป็นผู้ใหญ่
   d) ห้ามมีระบบลงโทษการจีบหลายคนพร้อมกัน — ผู้เล่นสะสมกับหลาย NPC พร้อมกันได้อิสระ ไม่มี jealousy mechanic
   e) UI ต้องแยกให้เห็นชัดระหว่าง StaffNPC กับผู้เล่นจริงเสมอ (เช่น badge/label ที่ nameplate) กันสับสน
   f) last_talked_at และแต้มหัวใจทุกหน่วยคำนวณฝั่ง server เท่านั้น ห้าม client ส่งค่าแต้มมาตรงๆ
   g) ออกแบบ StaffStoryNode/dialogue ให้เผื่อสถานะ "ปฏิเสธ" หรือความชอบเฉพาะตัวได้ ไม่ใช่ปลดล็อกทุกอย่าง
      อัตโนมัติแค่ heart level ถึง — ตัวละครต้องมีขอบเขต/ความต้องการของตัวเอง ไม่ใช่รางวัลที่จ่ายพอแล้วได้หมด

   Schema เริ่มต้น (ออกแบบให้ยืดหยุ่น ไม่ผูกเพศตายตัว เผื่อขยาย cast หลากหลายในอนาคต):
   StaffNPC       (id, name, artist_credit, home_shop_id, shift_start, shift_end,
                   signature_menu_id, season, is_active)
   StaffGiftPref  (staff_id, item_id, preference)         -- loved/liked/neutral/disliked
   PlayerAffinity (player_id, staff_id, heart_points, heart_level,
                   last_talked_at, unlocked_rewards[])
   StaffStoryNode (staff_id, required_level, story_text, reward_type, reward_ref)

   - shift_start/shift_end เป็นเวลาจริง (เช่น 20:00-24:00) ทำ 1 ตัวละครในเฟสนี้แต่ต้องออกแบบ field ให้พร้อม
     รองรับตัวถัดไปที่จะมาใน season หน้า (กระจายเวลากะกันเพื่อให้ server มีคนเข้าตลอดวัน)
   - signature_menu_id ผูกกับระบบสั่ง-เสิร์ฟที่มีอยู่แล้ว, StaffGiftPref ผูกกับ item จากระบบตกปลา/คราฟต์/
     marketplace ที่มีอยู่แล้ว (ของยิ่งหายากยิ่งได้แต้มเยอะ)

   วิธีได้แต้มหัวใจ (คำนวณฝั่ง server ทั้งหมด): สั่งเมนูที่แนะนำ (น้อย) / ให้ทิป (น้อย) / ให้ของขวัญ (เยอะสุด
   — ต้องหามาจากระบบตกปลา/คราฟต์/marketplace เท่านั้น ไม่มีของขวัญขายตรงด้วยเงินจริง) / คุยรายวัน (จำกัดวันละ
   ครั้งตาม server time) / ทำภารกิจส่วนตัว (ปลดล็อกตาม level, ผูกกับเควส Phase 1) / นั่งในร้านช่วง NPC เข้ากะ
   (สะสมช้าๆ แบบ passive)

   Heart Level & Reward track (implement ให้ครบทั้ง 10 level สำหรับตัวละครแรก):
   Lv1 ทักทายทั่วไป / Lv2 จำชื่อ+บทสนทนาเฉพาะตัว / Lv3 coaster ลายเฉพาะตัวละคร (ผูกข้อ 1) /
   Lv4 เรื่องส่วนตัวตอน 1 (ลงสมุดเรื่องเล่า) / Lv5 สูตรเครื่องดื่มลับ (ใส่เมนูร้านตัวเองได้จริง) /
   Lv6 ของแต่งร้าน/cosmetic / Lv7 ภารกิจส่วนตัวตอน 2 / Lv8 มาเยี่ยมร้านผู้เล่น (event ให้คนอื่นเห็น) /
   Lv9 เรื่องเล่าตอนจบ+title พิเศษ / Lv10 ภาพวาดพิเศษคู่ในบูธถ่ายรูป (ใช้ Photo schema จาก Phase 1 ที่เผื่อ
   flag 'heart_special' ไว้แล้ว) + วางใน Display Cabinet ได้ (ต่อยอดข้อ 1)

   ให้ Claude Code implement เฉพาะ 1 ตัวละครให้ครบทุกกลไกก่อน **ห้ามสร้างระบบจัดการหลาย season/ตัวละครใน
   เฟสนี้** ให้ schema รองรับอนาคตพอ แต่ยังไม่ต้องสร้าง UI/flow สำหรับ multi-season ตอนนี้

7. Test ที่ต้องเขียนจริงก่อนจบ phase นี้ (ไม่ใช่แค่ manual QA):
   - PlayerAffinity สร้างแถวที่ target เป็นผู้เล่นจริงไม่ได้ (ทดสอบยิง FK ผิดแล้วต้อง fail)
   - ไม่มี endpoint ใดขายแต้มหัวใจด้วยเงินจริงโดยตรง
   - Opening Night Coaster หยุดออกพอดี 7 วันหลัง shop.opened_at (mock เวลาทดสอบ)
   - Regular status trigger ที่ order_count = 20 พอดี ไม่ใช่ 19 หรือ 21
   - PlayerCoaster ป้องกัน duplicate จาก request ซ้อนกันพร้อมกัน (race condition test)

ให้ Claude Code อัปเดต Prisma schema + migration แยกจาก Phase 0-1 และรัน regression check ว่าไม่พัง flow เดิม
```

---

## Phase 3 — Scale & World Expansion

```
[ใส่ Project Brief + Art & Grid Standards ด้านบนก่อนเสมอ]
[บอกว่า Phase 0-2 เสร็จแล้ว ต่อยอดจากโค้ดเดิม]

ทำ Phase 3 เพิ่มฟีเจอร์ต่อไปนี้:

1. ตึกหลายชั้น
   - โครงสร้าง Floor entity (floor_number, theme, plot_grid) ความสูงต่อชั้น 256px ตาม Art & Grid Standards
   - บันได: teleport ทันทีไปชั้นถัดไป (โหลด scene ใหม่ใน Phaser)
   - ลิฟต์: มี "จุดเรียก", คิว, animation ประตู, delay 3-5 วิ ระหว่างรอ ใช้เวลานี้ preload asset ของชั้น
     ถัดไปแบบ progressive loading
   - Pathfinding ของ AutoServeBot scope แค่ในชั้นเดียว (ห้ามข้ามชั้นเอง)

2. ระบบกลางวัน-กลางคืนแบบไล่เฉด (Day/Night Cycle)
   - Implement ตาม architecture ที่วางไว้ตั้งแต่ Phase 0: tint overlay (multiply blend) สำหรับแสงโดยรวม +
     emissive layer แยก (additive blend) สำหรับไฟหน้าต่าง/นีออน — ไม่ต้อง gen asset ชุดที่สอง
   - เปลี่ยนผ่านเวลาแบบลื่นไหล (เย็น → ค่ำ → ดึก) ไม่ใช่แค่ 2 สถานะ
   - ผูกกับ shift_start/shift_end ของ StaffNPC จาก Phase 2: NPC แต่ละตัวปรากฏ/หายไปตามช่วงเวลาที่กำหนด
     ระบบเวลาต้อง expose ค่าที่ backend/game client ใช้เช็ค "ตอนนี้ NPC คนไหนอยู่กะ" ได้แบบ real-time

3. Server-wide Community Event
   - Event system: กำหนดเป้าหมายรวม (เช่น ทุกอาชีพช่วยกันเก็บของให้ครบ X ชิ้น)
   - Progress bar กลาง, reward แจกเมื่อถึงเป้าหมาย, reset ตามรอบเวลา

4. Cosmetic Monetization
   - Shop เงินจริง (Stripe หรือ IAP ผ่าน browser payment คุยรายละเอียด provider ที่เหมาะกับเว็บ)
   - Battle pass ตามฤดูกาล (season table, reward track)
   - **ย้ำกติกาเหล็ก:** ขายได้เฉพาะ cosmetic/ของตกแต่ง/ชุดให้ StaffNPC เท่านั้น ห้ามขาย heart point ตรงๆ
     (เฟสนี้คือจุดที่ระบบเงินจริงเข้ามาจริง ต้อง enforce ให้แน่นกว่าเดิม)

5. Performance & Progressive Loading (สำคัญมากสำหรับเว็บ)
   - Asset bundling ต่อชั้น/โซน (โหลดเฉพาะที่ผู้เล่นอยู่)
   - CDN integration (Cloudflare) สำหรับ static asset ทั้งหมด
   - Lazy load texture/sprite sheet ตาม viewport

ให้ Claude Code รายงาน bundle size ก่อน-หลัง optimize และแนะนำจุดที่ยังหนักเกินไปสำหรับเว็บ
```

---

## Phase 4 — B2B / Real Business Layer

```
[ใส่ Project Brief + Art & Grid Standards ด้านบนก่อนเสมอ]
[บอกว่า Phase 0-3 เสร็จแล้ว นี่คือ phase สุดท้าย ทำเมื่อมี user base จริงแล้วเท่านั้น]

ทำ Phase 4 เพิ่มฟีเจอร์ต่อไปนี้:

1. Verified Business Account
   - KYC flow เบื้องต้น (อัปโหลดเอกสารธุรกิจ, แอดมิน manual approve)
   - แยก role: player, business_owner, admin

2. Virtual Storefront สำหรับธุรกิจจริง
   - เมนู/ราคาจริงจากร้านค้าจริง แสดงในเกม
   - ปุ่ม "สั่งจริง" -> redirect ไปแอปสั่งของจริงหรือเว็บร้าน (soft-link ก่อน ไม่ทำ deep payment integration
     ในเวอร์ชันแรก)

3. In-world Advertising
   - Ad slot entity (ตำแหน่ง, ขนาด 512×256 ตาม Art & Grid Standards, ราคาต่อวัน/สัปดาห์)
   - Booking system + calendar สำหรับจองช่วงเวลา
   - Auto-approve เนื้อหาผ่าน image moderation API จริง (เช่น AWS Rekognition) ต่อยอดจาก moderation stub
     ที่วางไว้ตั้งแต่ Phase 0 — ตอนนี้คือจุดที่ต้องเปลี่ยน stub เป็นของจริง

4. Ad Dashboard (แยกเป็น Next.js app ใหม่ apps/ad-dashboard)
   - อัปโหลดแบนเนอร์/เมนู
   - Analytics: impression count, click count (เก็บ event ผ่าน Redis/ClickHouse แล้ว aggregate)
   - Billing: Stripe invoice สำหรับธุรกิจ (แยกจากระบบเงินในเกมผู้เล่น)

5. Compliance check
   - ให้ Claude Code สรุป checklist สิ่งที่ต้องตรวจสอบด้าน policy ก่อน launch จริง (เช่น การขายโฆษณาบนเว็บ
     ไม่ติด policy เหมือน mobile app store แต่ยังต้องเช็ก GDPR/PDPA เรื่องเก็บ user data สำหรับ ads)

ให้ Claude Code แยก dashboard นี้ deploy คนละ domain/subdomain จากตัวเกมหลัก
```

---

## Tips การใช้งานจริงกับ Claude Code

1. อย่ารวม phase ในครั้งเดียว — จบ phase หนึ่งให้รันได้สมบูรณ์ก่อน ค่อย commit แล้วเริ่ม phase ถัดไปเป็น session ใหม่
2. ขอให้ Claude Code เขียน test พื้นฐานต่อท้ายทุก phase โดยเฉพาะ **Phase 2** ที่มีกติกาเหล็กหลายข้อ — ให้เทส
   ยืนยันว่ากติกาเหล็ก enforce ได้จริงในโค้ด (DB constraint, foreign key, business logic) ไม่ใช่แค่คอมเมนต์
3. ถ้า bundle เกม (Phaser) เริ่มใหญ่ ให้สั่ง Claude Code รัน `vite build --report` แล้ววิเคราะห์ chunk size
   ก่อนเพิ่มฟีเจอร์ต่อ
4. เก็บ decision log — ให้ Claude Code เขียน/อัปเดต `DECISIONS.md` ทุกครั้งที่เลือก library/pattern สำคัญ
5. asset ที่ยังไม่มีของจริง ให้ยึด "ชื่อไฟล์ + ขนาด" ตาม Art & Grid Standards เป๊ะ เพื่อสลับเป็นของจริงทีหลัง
   แบบ drop-in โดยไม่ต้องแก้โค้ดแม้แต่บรรทัดเดียว
6. ก่อนเข้า Phase 4 (B2B) ทบทวนกติกาเหล็กเรื่องเงินจริงอีกรอบกับ Claude Code เพราะเป็นจุดที่ระบบเงินจริงเข้ามา
   สัมผัสกับระบบที่ก่อนหน้าเป็น in-game economy ล้วนๆ
7. ถ้า Claude Code เสนอทางลัดที่ขัดกับกติกาเหล็กข้อไหน (เช่น "ขายแต้มหัวใจตรงๆ ง่ายกว่า") ให้ปฏิเสธและชี้กลับไปที่
   Project Brief เสมอ — กติกาเหล็กมีไว้ป้องกันปัญหาที่แก้ยากทีหลัง (กฎหมาย, brand, community)
