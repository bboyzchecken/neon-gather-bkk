# Cozy Avenue — Project Plan

## 1. Concept Summary

**"Cozy Avenue"** (ชื่อชั่วคราว) — เกม cozy multiplayer แนว community mall/avenue
ที่ผู้เล่นเช่าพื้นที่ปล่อยร้าน ตกแต่งเอง ขายของ/เทรดกัน มีมินิเกม (ตกปลา/ตกกุ้ง),
ระบบอาชีพ-เลเวล-เควสแบบไม่มี combat, ระบบเสิร์ฟ/เก็บโต๊ะแบบบาร์จริง, ตู้กดอัตโนมัติ,
บูธถ่ายรูป, ตึกหลายชั้น (ลิฟต์/บันได), และรองรับโมเดลธุรกิจจริงมาลงโฆษณา/เมนูในภายหลัง

**Core Pillars**
- Async-first (ไม่ต้อง real-time hardcore แบบ MMO combat)
- Player-driven economy (เช่าพื้นที่ + เทรด + จ้างงานกันเอง)
- Screenshot-worthy (photo booth, การตกแต่งร้าน) → viral loop
- Phased complexity (เริ่มจาก MVP เล็ก ค่อยขยาย)

---

## 2. Feature Scope by Phase

### Phase 0 — MVP (Prove the loop)
- Avatar เดินได้ในพื้นที่เดียว (ชั้นเดียว, ไม่มีลิฟต์)
- ระบบเช่าบล็อกร้าน (grid ขนาดเท่ากัน) + template facade แบบตายตัว 3-5 แบบ
- อัปโหลด texture/โลโก้ทับ template (ไม่ custom mesh)
- ไอเทมขาย: spec ตายตัว (thumbnail 512x512, ราคาช่วงกำหนด)
- มินิเกมตกปลาแบบกดเอง (timing bar) 1 บ่อ
- Auto-serve บนโต๊ะ (ของ spawn/despawn ตรงๆ ไม่มี NPC เดิน)
- Marketplace ซื้อขาย/เทรดพื้นฐาน
- Leaderboard ง่ายๆ (รายสัปดาห์)

### Phase 1 — Community Depth
- ระบบอาชีพ (ประมง/สวน/ช่างฝีมือ/พ่อค้า) + เลเวล/สกิลทรี
- เควสหลัก + เควสอาชีพ + เควสรายวัน/สัปดาห์
- NPC พนักงานอัตโนมัติ (pathfinding เก็บโต๊ะ)
- ระบบพนักงานที่เป็นผู้เล่นจริง (job system + ค่าจ้าง/ทิป)
- ตู้กดอัตโนมัติ (vending machine)
- บูธถ่ายรูป + อัลบั้ม + แชร์โซเชียล

### Phase 2 — Scale & World Expansion
- ตึกหลายชั้น (ลิฟต์ + บันได, ธีมแยกตามชั้น)
- Server-wide community event (เควสรวมพลังทุกอาชีพ)
- Cosmetic monetization เต็มรูปแบบ (battle pass, ของตกแต่งพิเศษ)

### Phase 3 — B2B / Real-world Business Layer
- Verified business accounts (KYC)
- Virtual storefront สำหรับร้านค้าจริง (เมนู/โปรโมชั่นจริง)
- แบนเนอร์โฆษณาในพื้นที่ (billboard, LED, poster slots)
- Ad dashboard นอกเกม + analytics (impression/click)
- Billing แยกเงินจริง vs เงินในเกม

---

## 3. Tech Stack Recommendation

### 3.1 Client (Game Engine)
| ตัวเลือก | เหมาะกับ | หมายเหตุ |
|---|---|---|
| **Unity (C#)** ✅ แนะนำ | 2.5D/3D cozy game, มี asset store เยอะ, รองรับ mobile+PC+WebGL | Ecosystem ใหญ่, หา dev ง่าย, Netcode for GameObjects ใช้ทำ multiplayer เบื้องต้นได้ |
| Godot (GDScript/C#) | ทีมเล็ก, งบจำกัด, open-source | เบากว่า Unity แต่ ecosystem/asset น้อยกว่า, multiplayer ต้องทำเองเยอะกว่า |
| Roblox Studio (Luau) | ถ้าต้องการ built-in UGC economy + audience สำเร็จรูป | ข้อจำกัดเรื่อง IP/revenue share ของแพลตฟอร์ม, custom business model (โฆษณาแบรนด์จริง) ทำได้จำกัดกว่า |

→ **แนะนำ Unity** เพราะ scope มี custom economy/marketplace/ads ที่ต้องคุมเองเต็มที่ และรองรับ mobile ได้ดี (งบ dev เกม cozy ส่วนใหญ่เล่นบนมือถือ)

### 3.2 Multiplayer / Networking
- **Photon Fusion** หรือ **Unity Netcode for GameObjects** สำหรับ real-time layer เบาๆ (เห็นผู้เล่นอื่นเดิน, เห็นพนักงานเสิร์ฟสด)
- ส่วนใหญ่ของระบบ (marketplace, เควส, เลเวล, ร้านค้า) ทำเป็น **async ผ่าน REST API** ไม่ต้อง real-time sync ตลอดเวลา → ลดต้นทุน infra มาก

### 3.3 Backend
| Layer | เทคโนโลยี | เหตุผล |
|---|---|---|
| API Server | **Node.js (NestJS/Express)** หรือ **Go** | รองรับ concurrent request สูง, ecosystem payment/3rd-party ครบ |
| Database (หลัก) | **PostgreSQL** | ธุรกรรม เช่น marketplace, เช่าพื้นที่, inventory ต้องการ ACID |
| Cache/Session | **Redis** | เก็บ state ห้อง/โต๊ะแบบ real-time, leaderboard (sorted sets เหมาะมาก) |
| Realtime layer | **WebSocket (Socket.io)** หรือ Photon | sync ตำแหน่งผู้เล่น, สถานะโต๊ะ, การเสิร์ฟ |
| File/Asset storage | **AWS S3 / Cloudflare R2** | เก็บ texture ที่ผู้เล่นอัปโหลด, รูปถ่ายจาก photo booth |
| CDN | **Cloudflare** | โหลด asset เร็ว, รองรับผู้เล่นทั่วโลก |

### 3.4 Content Moderation
- **Auto-scan รูปภาพ**: AWS Rekognition / Google Cloud Vision (ตรวจ NSFW/ลิขสิทธิ์เบื้องต้น)
- Manual review queue สำหรับเนื้อหาที่ auto-scan ไม่มั่นใจ
- Report system ในเกม (ผู้เล่น flag เนื้อหา)

### 3.5 Payment
- **In-game currency**: จัดการเองใน backend (ledger table, ป้องกัน duplication/exploit)
- **Real-money (Phase 3 ads/business)**: Stripe (B2B invoicing) — แยกระบบจาก IAP
- **Mobile IAP**: Apple/Google IAP SDK (ต้องเช็ก policy เรื่องขายเงินในเกม/โฆษณาก่อนทำ Phase 3)

### 3.6 Analytics (สำคัญมากสำหรับ Phase 3 ads)
- **PostHog** หรือ **Mixpanel** สำหรับ product analytics (retention, funnel)
- Custom event tracking สำหรับ impression/click ของแบนเนอร์โฆษณา → เก็บลง PostgreSQL/ClickHouse แยก table สำหรับ ad dashboard

### 3.7 Admin/Ad Dashboard (Phase 3)
- **React + Next.js** ทำ dashboard แยกจากตัวเกม สำหรับธุรกิจอัปโหลดเมนู/แบนเนอร์ + ดู analytics

### 3.8 Art Pipeline
- Template-based system: กำหนด texture slot ขนาดคงที่ (เช่น facade 1024x1024, ป้ายร้าน 256x256)
- ใช้ AI image-gen (เช่น Claude + image model) ช่วย generate asset นิ่ง (ไอเทม, ไอคอน, พื้นหลัง) — หลีกเลี่ยงงานที่ต้องการ animation ต่อเนื่องซับซ้อน (ให้ animator จริงทำ pose หลักไม่กี่ท่า: เดิน, ตกปลา, เสิร์ฟ, ถ่ายรูป)

### 3.9 DevOps
- **Docker + Kubernetes (หรือ ECS ถ้าใช้ AWS)** สำหรับ scale backend
- **CI/CD**: GitHub Actions
- **Monitoring**: Grafana + Prometheus / Datadog

---

## 4. Suggested Team & Timeline (Rough)

| Phase | ทีมขั้นต่ำ | ระยะเวลาโดยประมาณ |
|---|---|---|
| Phase 0 (MVP) | 1 dev เกม + 1 backend + 1 artist (part-time) | 2-3 เดือน |
| Phase 1 | +1 dev (gameplay systems) | 2-3 เดือน |
| Phase 2 | +1 dev (multiplayer/infra) | 2-3 เดือน |
| Phase 3 | +1 backend (B2B/dashboard) + biz dev | 2+ เดือน (ขึ้นกับ user base) |

---

## 5. Key Risks to Track
1. **Content moderation** ต้องพร้อมตั้งแต่ Phase 0 ถ้าเปิดอัปโหลด texture ผู้เล่น
2. **Economy balance** (เงินเฟ้อ, ราคาเช่า) ต้องมี sink/source design ชัดเจนตั้งแต่ต้น
3. **App Store/Play Store policy** เรื่องโฆษณา/ลิงก์นอกแอป/เงินจริง — เช็กก่อนเข้า Phase 3
4. **Chicken-and-egg สำหรับ B2B ads** — ต้องมี user base มากพอก่อนขายโฆษณาได้จริง

---

## 6. Next Steps
- [ ] Lock กติกา MVP scope ให้แน่น (feature freeze สำหรับ Phase 0)
- [ ] ออกแบบ grid/template facade ขนาดจริง (pixel spec)
- [ ] ร่าง database schema เบื้องต้น (users, plots, items, orders, tables)
- [ ] Prototype มินิเกมตกปลา + ระบบเช่าพื้นที่ก่อนเป็นอันดับแรก (validate core loop)
