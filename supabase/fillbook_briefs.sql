-- fillbook_briefs — สรุป "เตรียมเทรดคืนนี้" (Edge Function `fillbook-ai` kind:'premarket' เป็นคนเขียนด้วย service key)
-- 1 แถวต่อ user ต่อวันเทรด (ทับของเดิมถ้าสร้างซ้ำ) · เจ้าของอ่านได้เฉพาะของตัวเอง · ไม่มี policy เขียน
-- รันทีละคำสั่งใน SQL Editor (ตอนสร้างตาราง เลือก "Run and enable RLS")

create table public.fillbook_briefs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null default 'fillbook',
  kind text not null,
  brief_date date not null,
  title text,
  content_md text not null,
  sources jsonb,
  cost_usd numeric(10,4),
  created_at timestamptz not null default now(),
  unique (user_id, app, kind, brief_date)
);

create policy "owner reads own briefs"
on public.fillbook_briefs
for select
to authenticated
using (auth.uid() = user_id);

-- ตัวตั้งเวลา 19:00 น. ไทย (= 12:00 UTC) จันทร์–ศุกร์ — วันหยุดตลาด US ฟังก์ชันข้ามเอง
-- ต้องเปิด extension pg_cron + pg_net ก่อน · <ANON_KEY> = anon key ใน js/supabase-config.js · <CRON_SECRET> = ค่าเดียวกับ secret FILLBOOK_CRON_SECRET
-- select cron.schedule('fillbook-premarket', '0 12 * * 1-5', $$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/fillbook-ai',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>', 'x-cron-secret', '<CRON_SECRET>'),
--     body := '{"kind":"premarket"}'::jsonb,
--     timeout_milliseconds := 10000);
-- $$);
