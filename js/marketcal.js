/* ============================================================
   marketcal.js — ปฏิทินตลาด: วันประกาศงบ (earnings) ต่อ ticker
   + อีเวนต์มหภาค (FOMC / CPI) + วัน OpEx (ศุกร์ที่ 3 ของเดือน)
   ------------------------------------------------------------
   earnings ดึงผ่าน Edge Function `quote` (kind:'earnings') แล้ว
   cache ไว้วันละครั้งใน localStorage — โควต้า API จึงไม่บาน
   ============================================================ */
(function () {
  const KEY = 'ozl_earn_v1';
  const today = () => new Date().toISOString().slice(0, 10);
  function cache() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  const norm = s => String(s || '').toUpperCase().trim();
  // ครั้งแรกหลังอัปเดต: ทิ้ง cache เดิมที่อาจเก็บ null ผิดๆ ไว้ทั้งวัน
  try { if (localStorage.getItem('ozl_earn_ver') !== '2') { localStorage.removeItem(KEY); localStorage.setItem('ozl_earn_ver', '2'); } } catch (e) {}

  // UNAVAIL = ยังตรวจไม่ได้ (Edge Function เวอร์ชันเก่า / ยิงไม่สำเร็จ) — ต่างจาก
  // null ที่หมายถึง "ตรวจแล้ว ไม่มีงบในช่วงนี้จริง". UNAVAIL จะไม่ถูก cache รายวัน
  const UNAVAIL = { unavailable: true };
  window.EARN_UNAVAIL = UNAVAIL;
  window.isEarnUnavail = v => !!(v && v.unavailable);

  // คืน { date, hour, epsEst } | null (ไม่มีงบ) | UNAVAIL (ตรวจไม่ได้)
  window.fetchEarnings = async function (symbol) {
    const sym = norm(symbol); if (!sym) return UNAVAIL;
    const c = cache(), hit = c[sym];
    if (hit && hit.at === today()) return hit.v;
    const sb = window.sbClient;
    if (!sb || !sb.functions) return UNAVAIL;
    try {
      const res = await sb.functions.invoke('quote', { body: { symbol: sym, kind: 'earnings' } });
      const rows = res && !res.error && res.data ? res.data.earningsCalendar : undefined;
      // ไม่มี key earningsCalendar เลย = ฟังก์ชันฝั่ง server ยังไม่รองรับ → อย่า cache
      if (!Array.isArray(rows)) return UNAVAIL;
      let v = null;
      if (rows.length) {
        const t = today();
        const next = rows.filter(r => r && r.date && r.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (next) v = { date: next.date, hour: next.hour || '', epsEst: next.epsEstimate != null ? next.epsEstimate : null };
      }
      c[sym] = { at: today(), v }; save(c);
      return v;
    } catch (e) { return UNAVAIL; }
  };
  // อ่านจาก cache แบบ sync (ใช้ตอน render ครั้งแรก ไม่ต้องรอ network)
  window.earningsCached = function (symbol) { const h = cache()[norm(symbol)]; return h ? h.v : UNAVAIL; };
  // ดึงหลายตัวพร้อมกัน (ยิงขนาน) → { TICKER: {date,…}|null }
  window.fetchEarningsBatch = async function (symbols) {
    const uniq = [...new Set((symbols || []).map(norm).filter(Boolean))];
    const out = {};
    await Promise.all(uniq.map(async s => { out[s] = await window.fetchEarnings(s); }));
    return out;
  };

  // ---- อีเวนต์มหภาค -------------------------------------------------------
  // FOMC = วันแถลงผล (วันที่ 2 ของการประชุม, 14:00 ET) ตามปฏิทินทางการ 2026
  // CPI  = วันประกาศ 8:30 ET; est:true = ยังไม่ยืนยัน (BLS ออกช่วงสัปดาห์ที่ 2)
  const FIXED = [
    { date: '2026-01-28', kind: 'FOMC', label: 'FOMC แถลงผล' },
    { date: '2026-03-18', kind: 'FOMC', label: 'FOMC แถลงผล + dot plot' },
    { date: '2026-04-29', kind: 'FOMC', label: 'FOMC แถลงผล' },
    { date: '2026-06-17', kind: 'FOMC', label: 'FOMC แถลงผล + dot plot' },
    { date: '2026-07-29', kind: 'FOMC', label: 'FOMC แถลงผล' },
    { date: '2026-09-16', kind: 'FOMC', label: 'FOMC แถลงผล + dot plot' },
    { date: '2026-10-28', kind: 'FOMC', label: 'FOMC แถลงผล' },
    { date: '2026-12-09', kind: 'FOMC', label: 'FOMC แถลงผล + dot plot' },
    { date: '2026-08-12', kind: 'CPI', label: 'CPI เดือน ก.ค.' },
    { date: '2026-09-10', kind: 'CPI', label: 'CPI เดือน ส.ค.', est: true },
    { date: '2026-10-13', kind: 'CPI', label: 'CPI เดือน ก.ย.', est: true },
    { date: '2026-11-10', kind: 'CPI', label: 'CPI เดือน ต.ค.', est: true },
    { date: '2026-12-10', kind: 'CPI', label: 'CPI เดือน พ.ย.', est: true },
  ];

  // ศุกร์ที่ 3 ของเดือน = วันหมดอายุ option รายเดือน (OpEx)
  function opex(year, month) {
    const d = new Date(Date.UTC(year, month, 1));
    let fridays = 0;
    while (true) {
      if (d.getUTCDay() === 5) { fridays++; if (fridays === 3) break; }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d.toISOString().slice(0, 10);
  }
  function opexList(months) {
    const out = [], now = new Date();
    for (let i = 0; i < (months || 6); i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      out.push({ date: opex(d.getUTCFullYear(), d.getUTCMonth()), kind: 'OPEX', label: 'OpEx รายเดือน' });
    }
    return out;
  }

  // อีเวนต์มหภาคตั้งแต่วันนี้ไปข้างหน้า (เรียงตามวัน)
  window.macroEvents = function (months) {
    const t = today();
    return [...FIXED, ...opexList(months || 6)]
      .filter(e => e.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date));
  };
  // อีเวนต์ที่ตกอยู่ในช่วง [from, to] — ใช้เตือน "มีงบ/FOMC ก่อนหมดอายุ"
  window.macroBetween = function (from, to) {
    if (!from || !to) return [];
    return [...FIXED, ...opexList(14)].filter(e => e.date >= from && e.date <= to && e.kind !== 'OPEX')
      .sort((a, b) => a.date.localeCompare(b.date));
  };
  window.MACRO_COLORS = { FOMC: '#8b5cf6', CPI: '#d8a229', OPEX: '#6aa6ff', EARN: '#e5484d' };
})();
