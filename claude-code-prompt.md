# Claude Code Build Prompt — Cozy Avenue (Web-First, Path B)

> วิธีใช้: copy เนื้อหาแต่ละ Phase ไปวางใน Claude Code ทีละ phase (อย่าวางทุก phase parานอกัน)
> เริ่มจาก "Phase 0 Prompt" ก่อนเสมอ ให้ Claude Code สร้าง scaffold ทั้งหมดให้เสร็จและรันได้จริงก่อนค่อยไป phase ถัดไป

---

## 0. Project Brief (ใส่ไว้ต้น prompt ทุก phase เพื่อให้ context ชัดเจน)

```
โปรเจกต์: Cozy Avenue — เว็บเกม cozy multiplayer แนว community mall
- ผู้เล่นเช่าพื้นที่/บล็อกร้าน ตกแต่งเอง ขายของ เทรดกัน
- มีมินิเกมตกปลา/ตกกุ้ง (กดเอง + auto/idle)
- ระบบอาชีพ-เลเวล-เควส (ไม่มี combat/damage)
- ระบบโต๊ะ: สั่ง → เสิร์ฟ → เก็บ (เหมือนบาร์จริง) มี NPC และผู้เล่นเป็นพนักงานได้
- ตู้กดอัตโนมัติ, บูธถ่ายรูป, ตึกหลายชั้น (ลิฟต์/บันได)
- Phase หลังมีระบบธุรกิจจริงมาลงโฆษณา/เมนู (ทำทีหลังสุด)

Tech stack (fixed ไว้แล้ว ห้ามเปลี่ยนโดยไม่ถาม):
- Client: Phaser.js 3.x (TypeScript) — 2.5D isometric/top-down cozy style
- Frontend shell (UI นอกเกม: login, dashboard, marketplace): React + Next.js (TypeScript)
- Backend API: Node.js + NestJS (TypeScript)
- Realtime: Socket.io (WebSocket)
- Database: PostgreSQL (ใช้ Prisma ORM)
- Cache/session/leaderboard: Redis
- Asset/File storage: S3-compatible (ใช้ MinIO ตอน dev, Cloudflare R2 ตอน production)
- Auth: JWT + refresh token
- Monorepo: Turborepo (แยก apps/game, apps/web, apps/api, packages/shared-types)
- Package manager: pnpm

กติกาการทำงานของ Claude Code:
1. สร้างเป็น monorepo เดียว ห้ามแยก repo
2. ทุก phase ต้องรันได้จริงด้วย `pnpm dev` แล้วเทสได้ทันทีก่อนไป phase ถัดไป
3. เขียน TypeScript strict mode ทุกที่ ห้ามใช้ any พร่ำเพรื่อ
4. ทุก API endpoint ต้องมี input validation (zod หรือ class-validator)
5. เขียน README.md อธิบายวิธีรันในทุก phase ที่เพิ่ม
6. Commit เป็นก้อนเล็กๆ พร้อม message อธิบายชัดเจน
```

---

## Phase 0 Prompt — MVP Core Loop

```
[ใส่ Project Brief ด้านบนก่อน]

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
   - Tilemap แบบ isometric หรือ top-down (เลือกที่ทำง่ายกว่าใน Phaser ก็ได้ อธิบายเหตุผลที่เลือก)
   - Avatar เดินได้ด้วย arrow key/WASD, sync ตำแหน่งผ่าน Socket.io ให้ผู้เล่นอื่นเห็น

3. ระบบเช่าพื้นที่ (Plot System)
   - Grid บล็อกขนาดเท่ากัน (กำหนด constant เช่น 4x4 tile ต่อบล็อก)
   - API: GET /plots, POST /plots/:id/rent
   - แสดงสถานะบล็อกในเกม (ว่าง/มีคนเช่า/ของฉัน)

4. Template facade แบบง่าย
   - 3 แบบ template หน้าร้านตายตัว (ให้สร้าง placeholder sprite ไปก่อน ไม่ต้องสวย)
   - อัปโหลด texture ทับ slot ที่กำหนด (เก็บไฟล์ที่ MinIO)

5. ไอเทม + Marketplace พื้นฐาน
   - Schema: Item (id, name, price, category, thumbnail_url, owner_id)
   - API: CRUD สินค้า, ซื้อขายพื้นฐาน (โอนเงินในเกมระหว่าง user, ต้องมี transaction/ledger table กันเงินหาย)

6. มินิเกมตกปลาแบบกดเอง
   - Timing bar mechanic ง่ายๆ 1 บ่อ
   - ปลามี rarity 3 ระดับ (common/rare/legendary) สุ่มตาม weight
   - เก็บผลลัพธ์ลง inventory ผู้เล่น

7. โต๊ะ + Auto-serve (ไม่มี NPC เดินตอนนี้)
   - Table state: empty -> ordered -> served -> collected (auto despawn หลังเวลาหนึ่ง)
   - แสดง object บนโต๊ะจริงในเกม (ใช้ sprite ง่ายๆ)

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

## Phase 1 Prompt — Community Depth

```
[ใส่ Project Brief ด้านบนก่อน]
[บอก Claude Code ว่า Phase 0 เสร็จแล้ว ให้ต่อยอดจากโค้ดเดิม ไม่ใช่เขียนใหม่]

ทำ Phase 1 ต่อจาก Phase 0 เพิ่มฟีเจอร์ต่อไปนี้:

1. ระบบอาชีพ (Job/Class System แบบไม่มี combat)
   - อาชีพ: Fisher, Farmer, Crafter, Merchant, Explorer
   - แต่ละอาชีพมี XP แยก, เลเวลอัพปลดล็อก perk (ไม่ใช่ damage stat)
     เช่น Fisher เลเวลสูง = โอกาสได้ปลาหายากเพิ่ม, inventory ใหญ่ขึ้น
   - Schema: PlayerJob (player_id, job_type, xp, level)
   - Skill tree เบาๆ ต่อ job (3 กิ่งย่อยต่ออาชีพก็พอ)

2. ระบบเควส
   - Quest table: main quest, job quest, daily/weekly quest
   - Quest tracker UI ใน game canvas
   - Community quest (server-wide goal, progress bar รวมทุกคน)

3. NPC พนักงานอัตโนมัติ
   - Pathfinding แบบง่าย (grid-based A* หรือ ใช้ library เช่น easystar.js)
   - NPC state machine: idle -> เดินไปโต๊ะที่มีของค้าง -> เก็บ -> เดินกลับจุดเริ่ม

4. ระบบพนักงานผู้เล่นจริง (Job board)
   - เจ้าของร้านโพสต์ตำแหน่งงาน (ค่าจ้าง/สัดส่วนรายได้)
   - ผู้เล่นสมัครงาน ได้รับ notification เมื่อมีออเดอร์ใหม่ในร้านที่ทำงานอยู่
   - ระบบทิป (ผู้เล่นให้ทิปพนักงานหลังรับบริการ)

5. ตู้กดอัตโนมัติ (Vending Machine)
   - วางเป็น object แยกจากบล็อกร้านเต็ม (footprint เล็ก 1x1)
   - ซื้อ -> animation ของหล่น -> เก็บเข้า inventory
   - เจ้าของต้อง restock (API endpoint + UI แจ้งเตือนของหมด)

6. บูธถ่ายรูป (Photo Booth)
   - เข้าไปยืนในกรอบ -> เลือก background/pose -> capture canvas เป็นรูปภาพ (ใช้ Phaser render texture หรือ html2canvas)
   - เก็บรูปใน S3/MinIO ผูกกับ user, มีหน้า "อัลบั้ม" ใน Next.js web app
   - ปุ่ม share (generate shareable link/image URL)

ให้ Claude Code อัปเดต Prisma schema เพิ่ม entity ใหม่ทั้งหมด และเขียน migration แยกจาก Phase 0
ทดสอบว่าไม่พังของเดิม (regression check บน flow หลักของ Phase 0)
```

---

## Phase 2 Prompt — Scale & World Expansion

```
[ใส่ Project Brief ด้านบนก่อน]
[บอกว่า Phase 0-1 เสร็จแล้ว ต่อยอดจากโค้ดเดิม]

ทำ Phase 2 เพิ่มฟีเจอร์ต่อไปนี้:

1. ตึกหลายชั้น
   - โครงสร้าง Floor entity (floor_number, theme, plot_grid)
   - บันได: teleport ทันทีไปชั้นถัดไป (โหลด scene ใหม่ใน Phaser)
   - ลิฟต์: มี "จุดเรียก", คิว, animation ประตู, delay 3-5 วิ ระหว่างรอ
     ใช้เวลานี้ preload asset ของชั้นถัดไปแบบ progressive loading
   - Pathfinding ของ NPC scope แค่ในชั้นเดียว (ห้ามข้ามชั้นเอง)

2. Server-wide Community Event
   - Event system: กำหนดเป้าหมายรวม (เช่น ทุกอาชีพช่วยกันเก็บของให้ครบ X ชิ้น)
   - Progress bar กลาง, reward แจกเมื่อถึงเป้าหมาย, reset ตามรอบเวลา

3. Cosmetic Monetization
   - Shop เงินจริง (Stripe หรือ IAP ผ่าน browser payment คุยรายละเอียด provider ที่เหมาะกับเว็บ)
   - Battle pass ตามฤดูกาล (season table, reward track)

4. Performance & Progressive Loading (สำคัญมากสำหรับเว็บ)
   - Asset bundling ต่อชั้น/โซน (โหลดเฉพาะที่ผู้เล่นอยู่)
   - CDN integration (Cloudflare) สำหรับ static asset ทั้งหมด
   - Lazy load texture/sprite sheet ตาม viewport

ให้ Claude Code รายงาน bundle size ก่อน-หลัง optimize และแนะนำจุดที่ยังหนักเกินไปสำหรับเว็บ
```

---

## Phase 3 Prompt — B2B / Real Business Layer

```
[ใส่ Project Brief ด้านบนก่อน]
[บอกว่า Phase 0-2 เสร็จแล้ว นี่คือ phase สุดท้าย ทำเมื่อมี user base จริงแล้วเท่านั้น]

ทำ Phase 3 เพิ่มฟีเจอร์ต่อไปนี้:

1. Verified Business Account
   - KYC flow เบื้องต้น (อัปโหลดเอกสารธุรกิจ, แอดมิน manual approve)
   - แยก role: player, business_owner, admin

2. Virtual Storefront สำหรับธุรกิจจริง
   - เมนู/ราคาจริงจากร้านค้าจริง แสดงในเกม
   - ปุ่ม "สั่งจริง" -> redirect ไปแอปสั่งของจริงหรือเว็บร้าน (soft-link ก่อน ไม่ทำ deep payment integration ในเวอร์ชันแรก)

3. In-world Advertising
   - Ad slot entity (ตำแหน่ง, ขนาด, ราคาต่อวัน/สัปดาห์)
   - Booking system + calendar สำหรับจองช่วงเวลา
   - Auto-approve เนื้อหาผ่าน image moderation API (เช่น AWS Rekognition) ก่อนขึ้นจริง

4. Ad Dashboard (แยกเป็น Next.js app ใหม่ apps/ad-dashboard)
   - อัปโหลดแบนเนอร์/เมนู
   - Analytics: impression count, click count (เก็บ event ผ่าน Redis/ClickHouse แล้ว aggregate)
   - Billing: Stripe invoice สำหรับธุรกิจ (แยกจากระบบเงินในเกมผู้เล่น)

5. Compliance check
   - ให้ Claude Code สรุป checklist สิ่งที่ต้องตรวจสอบด้าน policy ก่อน launch จริง
     (เช่น การขายโฆษณาบนเว็บไม่ติด policy เหมือน mobile app store แต่ยังต้องเช็ก GDPR/PDPA เรื่องเก็บ user data สำหรับ ads)

ให้ Claude Code แยก dashboard นี้ deploy คนละ domain/subdomain จากตัวเกมหลัก
```

---

## Tips การใช้งานจริงกับ Claude Code

1. **อย่ารวม phase ในครั้งเดียว** — ให้ Claude Code จบ phase หนึ่งให้รันได้สมบูรณ์ก่อน ค่อย commit แล้วเริ่ม phase ถัดไปเป็น session ใหม่
2. **ขอให้ Claude Code เขียน test พื้นฐาน** ต่อท้ายทุก phase (unit test อย่างน้อยสำหรับ business logic เช่น การคำนวณเงิน, XP, rarity)
3. **ถ้า bundle เกม (Phaser) เริ่มใหญ่** ให้สั่ง Claude Code รัน `vite build --report` แล้ววิเคราะห์ chunk size ก่อนเพิ่มฟีเจอร์ต่อ
4. **เก็บ decision log** — ให้ Claude Code เขียนไฟล์ `DECISIONS.md` บันทึกทุกครั้งที่เลือก library/pattern สำคัญ เพื่อกลับมาอ่านทีหลังได้ง่าย
