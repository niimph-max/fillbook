-- ============================================================
--  Fillbook — Partner Fund (กองหุ้นส่วน)
--  รันไฟล์นี้ครั้งเดียวใน Supabase → SQL Editor → New query → วาง → Run
--  ปลอดภัยต่อการรันซ้ำ (ใช้ IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ============================================================

-- 1) funds ------------------------------------------------------------------
create table if not exists public.funds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id  text not null,                    -- portfolio id ของบัญชี Dad&Mom
  fx_rate     numeric not null default 32.5,    -- USD → THB
  created_at  timestamptz not null default now()
);
-- หนึ่ง user มีได้หนึ่งกองต่อหนึ่งบัญชี
create unique index if not exists funds_user_account_uidx
  on public.funds (user_id, account_id);

-- 2) fund_partners ----------------------------------------------------------
create table if not exists public.fund_partners (
  id       uuid primary key default gen_random_uuid(),
  fund_id  uuid not null references public.funds(id) on delete cascade,
  name     text not null,
  color    text
);
create index if not exists fund_partners_fund_idx on public.fund_partners (fund_id);

-- 3) fund_transactions ------------------------------------------------------
create table if not exists public.fund_transactions (
  id              uuid primary key default gen_random_uuid(),
  fund_id         uuid not null references public.funds(id) on delete cascade,
  partner_id      uuid not null references public.fund_partners(id) on delete cascade,
  date            date not null,
  type            text not null check (type in ('deposit','withdraw')),
  amount_thb      numeric not null,
  nlv_before_thb  numeric not null check (nlv_before_thb > 0),
  seq             int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists fund_txn_fund_idx on public.fund_transactions (fund_id);

-- 4) fund_assets (หนึ่งแถวต่อกอง) -------------------------------------------
create table if not exists public.fund_assets (
  fund_id         uuid primary key references public.funds(id) on delete cascade,
  thai_stocks_thb numeric not null default 0,
  gold_qty        numeric not null default 0,
  gold_price_thb  numeric not null default 0,
  cash_thb        numeric not null default 0
);
-- (ถ้าเคยสร้างตารางก่อนมี thai_stocks_thb เพิ่มคอลัมน์นี้ให้)
alter table public.fund_assets add column if not exists thai_stocks_thb numeric not null default 0;

-- ============================================================
--  Row Level Security — เปิดทุกตาราง
-- ============================================================
alter table public.funds             enable row level security;
alter table public.fund_partners     enable row level security;
alter table public.fund_transactions enable row level security;
alter table public.fund_assets       enable row level security;

-- funds: เจ้าของเท่านั้น (ยึดจาก user_id = auth.uid())
drop policy if exists funds_owner on public.funds;
create policy funds_owner on public.funds
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ตารางลูก: ตรวจสิทธิ์ผ่านกอง (fund) ที่เป็นของ user
drop policy if exists fund_partners_owner on public.fund_partners;
create policy fund_partners_owner on public.fund_partners
  for all using (exists (select 1 from public.funds f where f.id = fund_partners.fund_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.funds f where f.id = fund_partners.fund_id and f.user_id = auth.uid()));

drop policy if exists fund_txn_owner on public.fund_transactions;
create policy fund_txn_owner on public.fund_transactions
  for all using (exists (select 1 from public.funds f where f.id = fund_transactions.fund_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.funds f where f.id = fund_transactions.fund_id and f.user_id = auth.uid()));

drop policy if exists fund_assets_owner on public.fund_assets;
create policy fund_assets_owner on public.fund_assets
  for all using (exists (select 1 from public.funds f where f.id = fund_assets.fund_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.funds f where f.id = fund_assets.fund_id and f.user_id = auth.uid()));
