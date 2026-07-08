-- ============================================================
--  Baan Singthong Fund — เพิ่มช่อง "พอร์ตหุ้นไทย" ในสินทรัพย์กอง
--  รันใน Supabase → SQL Editor หนึ่งครั้ง (ปลอดภัย รันซ้ำได้)
--  * จำเป็นเฉพาะคนที่เคยสร้างตาราง fund_assets ไปแล้ว *
-- ============================================================
alter table public.fund_assets
  add column if not exists thai_stocks_thb numeric not null default 0;
