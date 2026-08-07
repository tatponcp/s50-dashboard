import { getMockBrief } from "@/lib/mockBriefs";
import { BriefView } from "@/components/BriefView";

// Phase 1: อ่านจาก mock data ในเครื่อง — Phase 2 จะเปลี่ยนไปอ่านจาก Supabase (mb_briefs, status='published')
export default async function BriefPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const brief = getMockBrief(date);

  if (!brief) {
    return (
      <main className="mb-main">
        <p className="mb-subtitle">ยังไม่มี Morning Brief สำหรับวันที่ {date}</p>
      </main>
    );
  }

  return <BriefView brief={brief} />;
}
