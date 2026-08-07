# Morning Brief — Next.js app

แทนที่ระบบ `client/` + `shared/` + `internal/` เดิม (static, publish ด้วยการดาวน์โหลด/ลากไฟล์/git push)
ด้วยเว็บแอปที่ IC กรอกข้อมูล กด Publish แล้วลูกค้าเห็นทันที — ดูแผนเต็มที่
`HANDBOOK.md` ที่ root โปรเจกต์ (จะอัปเดตเมื่อ migration เสร็จ Phase 5)

**สถานะตอนนี้: Phase 1 (cleanup + scaffold)** — พิสูจน์ว่า component ที่ port
มาจาก `shared/render-core.js` แสดงผลตรงกับของเดิม โดยใช้ mock data
(`src/lib/mockBriefs.ts`, คัดลอกจาก `client/data/2026-08-06.json`) ยังไม่ต่อ Supabase จริง

## รันดูในเครื่อง

```
npm install
npm run dev
```

เปิด `http://localhost:3000/` (redirect ไปวันล่าสุดใน mock data) และ
`http://localhost:3000/edit` (พรีวิว — ยังไม่มีฟอร์มกรอกจริง มาใน Phase 3)

## โครงสร้าง

```
src/
├── app/
│   ├── (public)/          # ไม่มี auth — หน้าที่ลูกค้าเห็น
│   │   ├── page.tsx        # redirect ไปวันล่าสุด
│   │   └── [date]/page.tsx # brief ของวันที่ระบุ
│   ├── (ic)/edit/          # จะมี auth gate ใน Phase 4 (ยังไม่มีตอนนี้)
│   └── layout.tsx          # ฟอนต์ (Fraunces/Inter/Noto Sans Thai/JetBrains Mono) + globals.css
├── components/              # port มาจาก shared/render-core.js (renderOverview/renderSection)
├── lib/
│   ├── types.ts             # shape ของ Brief — คงเดิมตาม client/data/*.json เพื่อ import Supabase ตรงๆ ได้
│   ├── format.ts             # formatThaiDate, splitHighlight (แทน dangerouslySetInnerHTML)
│   └── mockBriefs.ts         # ข้อมูลจำลอง Phase 1 เท่านั้น — ลบทิ้งตอนต่อ Supabase (Phase 2)
```

## หมายเหตุ Next.js 16

โปรเจกต์นี้ใช้ Next.js 16 ซึ่งมีการเปลี่ยนแปลงจากเวอร์ชันเก่า (`middleware.js` ถูก
เปลี่ยนชื่อเป็น `proxy.js`, `params` เป็น `Promise` เสมอ) — ดู
`node_modules/next/dist/docs/` ก่อนแก้โค้ดที่เกี่ยวกับ routing/auth
