import { createClient } from "@supabase/supabase-js";
import type { Brief } from "./types";

// client ฝั่ง public — ใช้ anon/publishable key เท่านั้น (ปลอดภัยที่จะ expose ให้
// browser เห็นได้ เพราะ RLS ของ mb_briefs จำกัดให้ select ได้แค่ status='published')
// อย่าใส่ service_role key ที่นี่เด็ดขาด — ตัวนั้นสำหรับ route ฝั่ง server เท่านั้น (Phase 3)
function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey);
}

interface MbBriefRow {
  trade_date: string;
  content: Brief;
}

export async function getPublishedBrief(date: string): Promise<Brief | undefined> {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("mb_briefs")
    .select("trade_date, content")
    .eq("trade_date", date)
    .eq("status", "published")
    .maybeSingle<MbBriefRow>();

  if (error) throw error;
  return data?.content;
}

export async function getLatestPublishedDate(): Promise<string | undefined> {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("mb_briefs")
    .select("trade_date")
    .eq("status", "published")
    .order("trade_date", { ascending: false })
    .limit(1)
    .maybeSingle<{ trade_date: string }>();

  if (error) throw error;
  return data?.trade_date;
}
