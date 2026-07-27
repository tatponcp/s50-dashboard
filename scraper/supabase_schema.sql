-- ============================================================
-- Supabase schema สำหรับ S50 Options Dashboard
-- รันครั้งเดียวใน SQL Editor ของ Supabase project (ก่อนแก้ scraper)
-- แปลงตรงจากโครงสร้าง data.json เดิม — ไม่มี login จึงเปิดอ่านสาธารณะ
-- (RLS เปิดไว้แต่ policy อนุญาต select ให้ทุกคน กันไว้เผื่ออนาคตอยากล็อก)
-- ============================================================

-- สรุปรายวัน: spot, การเปลี่ยนแปลง, DTE ของซีรีส์หลัก
create table if not exists daily_summary (
  trade_date   date primary key,
  spot         numeric not null,
  spot_chg     numeric,
  dte          int,
  source       text not null default 'TFEX'
);

-- ราย strike ต่อซีรีส์ต่อวัน (ใจกลางของ dashboard)
create table if not exists options_series (
  trade_date   date not null references daily_summary(trade_date) on delete cascade,
  series_code  text not null,      -- เช่น S50U26
  expiry       date not null,
  strike       numeric not null,
  call_oi      numeric,
  put_oi       numeric,
  call_vol     numeric,
  put_vol      numeric,
  call_iv      numeric,
  put_iv       numeric,
  call_delta   numeric,
  put_delta    numeric,
  call_gamma   numeric,            -- เก็บเผื่อโปรเจกต์ GEX ในอนาคต (เหมือน data.json เดิม)
  put_gamma    numeric,
  primary key (trade_date, series_code, strike)
);

-- ค้นตามช่วงวันที่บ่อย (IV Rank, OI change 1D ฯลฯ) — ใส่ index ให้ query เร็ว
create index idx_options_series_date on options_series (trade_date);
create index idx_options_series_code on options_series (series_code, trade_date);

-- เปิด RLS แล้วอนุญาต select สาธารณะ (ไม่มี login ตามที่ตกลงกัน)
alter table daily_summary enable row level security;
alter table options_series enable row level security;

-- drop ก่อน create กัน error เวลารัน SQL นี้ซ้ำตอนตั้งค่า (create policy ซ้ำ = error)
drop policy if exists "public read daily_summary" on daily_summary;
create policy "public read daily_summary"
  on daily_summary for select
  using (true);

drop policy if exists "public read options_series" on options_series;
create policy "public read options_series"
  on options_series for select
  using (true);

-- หมายเหตุ: insert/update ทำได้เฉพาะผ่าน service_role key เท่านั้น
-- (scraper ใช้ key นี้จาก GitHub Secret — RLS ไม่บังคับกับ service_role)
