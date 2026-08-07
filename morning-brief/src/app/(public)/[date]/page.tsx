import { getPublishedBrief } from "@/lib/supabase";
import { BriefView } from "@/components/BriefView";

// Phase 2: อ่านจาก Supabase (mb_briefs, status='published') — RLS ป้องกันไม่ให้เห็น draft
export default async function BriefPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const brief = await getPublishedBrief(date);

  if (!brief) {
    return (
      <main className="mb-main">
        <p className="mb-subtitle">ยังไม่มี Morning Brief สำหรับวันที่ {date}</p>
      </main>
    );
  }

  return <BriefView brief={brief} />;
}
