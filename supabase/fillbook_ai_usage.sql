-- fillbook_ai_usage — บันทึกการใช้ฟีเจอร์ AI (Edge Function `fillbook-ai` เป็นคนเขียนด้วย service key)
-- เจ้าของอ่านได้เฉพาะแถวของตัวเอง (ใช้ดูรีวิวเก่า + ค่าใช้จ่าย) · ไม่มี policy เขียน
-- รันทีละคำสั่งใน SQL Editor (ตอนสร้างตาราง เลือก "Run and enable RLS")

create table public.fillbook_ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null default 'fillbook',
  kind text not null,
  ref text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  output_text text,
  created_at timestamptz not null default now()
);

create policy "owner reads own ai usage"
on public.fillbook_ai_usage
for select
to authenticated
using (auth.uid() = user_id);
