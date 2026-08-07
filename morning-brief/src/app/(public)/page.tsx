import { redirect } from "next/navigation";
import { getLatestMockDate } from "@/lib/mockBriefs";

// Phase 1: หา "วันล่าสุด" จาก mock data — Phase 2 จะเปลี่ยนไปอ่านจาก Supabase (mb_briefs)
export default function Home() {
  redirect(`/${getLatestMockDate()}`);
}
