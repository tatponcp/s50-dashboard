import { redirect } from "next/navigation";
import { getLatestPublishedDate } from "@/lib/supabase";

// Phase 2: หา "วันล่าสุดที่ publish แล้ว" จาก Supabase (mb_briefs)
export default async function Home() {
  const latest = await getLatestPublishedDate();
  if (!latest) {
    return (
      <main className="mb-main">
        <p className="mb-subtitle">ยังไม่มี Morning Brief เผยแพร่ — กลับมาดูใหม่พรุ่งนี้เช้าครับ</p>
      </main>
    );
  }
  redirect(`/${latest}`);
}
