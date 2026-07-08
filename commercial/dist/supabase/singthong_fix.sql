-- ============================================================
--  Singthong Funding — แก้ข้อมูลชุดเก่า (ถ้าเคยเปิดแท็บหุ้นส่วนแล้ว)
--  รันใน Supabase → SQL Editor (รันซ้ำได้ ปลอดภัย)
--  * ถ้ายังไม่เคยเปิดแท็บหุ้นส่วนเลย ไม่ต้องรันไฟล์นี้ *
-- ============================================================

-- 1) เปลี่ยนชื่อหุ้นส่วนเดิม → ชื่อจริง
update public.fund_partners set name = 'ปฐมพร ลิ้นทอง'   where name = 'พ่อ';
update public.fund_partners set name = 'พุทรา ลิ้นทอง'    where name = 'แม่';
update public.fund_partners set name = 'นวลจันทร์ ลิ้นทอง' where name = 'เรา';

-- 2) แก้วันลงทุนวันแรก 05/01/2026 → 03/11/2025 (3/11/2568)
update public.fund_transactions
   set date = '2025-11-03'
 where type = 'deposit' and date = '2026-01-05';
