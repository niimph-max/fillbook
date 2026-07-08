/* ============================================================
   news.js — ดึง "ข่าว / ข้อมูลล่าสุด" ของหุ้นด้วย Claude
   ------------------------------------------------------------
   เรียกผ่าน Supabase Edge Function ชื่อ `news` ซึ่งเก็บ
   Anthropic API key ไว้เป็น secret ฝั่ง server และเปิด
   web search ให้ Claude ค้นข้อมูลล่าสุดเอง (ดู supabase/
   functions/news/index.ts). ต้องล็อกอินก่อน (invoke ส่ง JWT).

   ถ้าไม่มี backend (เช่นรันใน preview) จะ fallback ไปที่
   window.claude.complete เพื่อให้เห็น UI ทำงานได้
   (โหมด preview ค้นเว็บไม่ได้ — ใช้สำหรับดูดีไซน์เท่านั้น)

   Export:
     window.fetchTickerNews(symbol, { force })  → { text, at, source, cached }
     window.ozlNewsPrompt(symbol)               → prompt ที่ส่งให้ Claude
     window.ozlNewsCache.read/write/clear
   ============================================================ */
(function () {
  // ---- prompt เดียวกับที่ตั้งไว้กับ Claude (แทน [TICKER] ด้วย symbol) ----
  var PROMPT_TEMPLATE = [
    'วิเคราะห์หุ้น [TICKER] ให้ครอบคลุมหัวข้อต่อไปนี้โดยใช้ข้อมูลล่าสุดจากการค้นหาเว็บ:',
    '',
    '1. **ภาพรวมบริษัท**',
    '   - ธุรกิจหลักและกลุ่มรายได้',
    '   - ประเทศ/ตลาดที่ดำเนินงาน',
    '   - จำนวนพนักงานและ Market Cap',
    '',
    '2. **ทีมผู้บริหาร**',
    '   - CEO และประวัติโดยย่อ (ประสบการณ์, วิสัยทัศน์)',
    '   - CFO และทีมบริหารระดับสูงที่สำคัญ',
    '   - Track record ของผู้บริหาร (ผลงานที่ผ่านมา, ความน่าเชื่อถือ)',
    '   - การถือหุ้นของผู้บริหาร (Insider Ownership)',
    '   - ประวัติการให้ Guidance — แม่นยำหรือมักพลาด?',
    '',
    '3. **ผลประกอบการล่าสุด**',
    '   - รายได้, EPS จริง vs คาดการณ์',
    '   - การเติบโต YoY',
    '   - ไตรมาสล่าสุดที่รายงาน',
    '',
    '4. **Guidance และแนวโน้ม**',
    '   - เป้าหมายรายได้และ EPS ของปีนี้และปีหน้า',
    '   - ปัจจัยขับเคลื่อนการเติบโต',
    '   - โปรแกรมหรือสัญญาใหม่ที่น่าสนใจ',
    '',
    '5. **จุดแข็งและความเสี่ยง**',
    '   - Moat หรือความได้เปรียบในการแข่งขัน',
    '   - ความเสี่ยงสำคัญที่ต้องติดตาม',
    '',
    '6. **มุมมองนักวิเคราะห์**',
    '   - Consensus Rating (Buy/Hold/Sell)',
    '   - เป้าราคาเฉลี่ยและช่วง High-Low',
    '   - ความเห็นของ Broker รายสำคัญ',
    '',
    '7. **มุมมองการเทรด Options**',
    '   - ทำไมราคาขยับวันนี้ (สรุปสั้นๆ)',
    '   - IV / IV Rank และ sentiment ปัจจุบัน',
    '   - เหมาะกับนักลงทุนประเภทไหน (Growth / Value / Dividend)',
    '   - ระดับความเสี่ยง (Beta, ความผันผวน)',
    '',
    '8. **ข่าวล่าสุด**',
    '   - งบ / earnings ที่จะออก + วันสำคัญ',
    '   - พาดหัวข่าวเด่น + วันที่',
    '   - ความเคลื่อนไหวล่าสุดที่น่าสนใจ',
    '',
    'ตอบเป็นภาษาไทย จัดรูปแบบด้วย Markdown (หัวข้อ ## และ bullet) ให้อ่านง่าย',
    'หมายเหตุ: ระบุแหล่งที่มาของข้อมูลและวันที่ล่าสุดที่ใช้วิเคราะห์ทุกครั้ง'
  ].join('\n');

  function buildPrompt(sym) {
    return PROMPT_TEMPLATE.split('[TICKER]').join(sym);
  }
  window.ozlNewsPrompt = buildPrompt;
  window.OZL_NEWS_PROMPT_TEMPLATE = PROMPT_TEMPLATE;

  // ---- cache ต่อ symbol (เก็บใน localStorage, แสดงทันที + รีเฟรชได้) ----
  var CACHE_PREFIX = 'ozl_news_';
  function readCache(sym) {
    try { var r = localStorage.getItem(CACHE_PREFIX + sym); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function writeCache(sym, obj) {
    try { localStorage.setItem(CACHE_PREFIX + sym, JSON.stringify(obj)); } catch (e) {}
  }
  function clearCache(sym) {
    try { localStorage.removeItem(CACHE_PREFIX + sym); } catch (e) {}
  }
  window.ozlNewsCache = { read: readCache, write: writeCache, clear: clearCache };

  // ---- backend: Supabase edge function `news` (Claude + web search) ----
  async function viaBackend(sym) {
    var sb = window.sbClient;
    if (!sb || !sb.functions) return null;
    var res = await sb.functions.invoke('news', { body: { symbol: sym } });
    if (res && res.error) throw new Error((res.error && res.error.message) || 'backend error');
    if (res && res.data && res.data.text) return { text: res.data.text, source: 'claude' };
    if (res && res.data && res.data.error) throw new Error(res.data.error);
    return null;
  }

  // ---- fallback: window.claude.complete (ใช้ใน preview เท่านั้น) ----
  async function viaPreview(sym) {
    if (!(window.claude && typeof window.claude.complete === 'function')) return null;
    var text = await window.claude.complete(buildPrompt(sym));
    return text ? { text: text, source: 'preview' } : null;
  }

  // window.fetchTickerNews(symbol, { force })
  window.fetchTickerNews = async function (sym, opts) {
    sym = (sym || '').toString().toUpperCase().trim();
    opts = opts || {};
    if (!sym) throw new Error('no symbol');

    if (!opts.force) {
      var cached = readCache(sym);
      if (cached && cached.text) return Object.assign({}, cached, { cached: true });
    }

    var result = null, firstErr = null;
    try { result = await viaBackend(sym); }
    catch (e) { firstErr = e; }
    if (!result) {
      try { result = await viaPreview(sym); }
      catch (e) { if (!firstErr) firstErr = e; }
    }
    if (!result) {
      if (firstErr) throw firstErr;
      var err = new Error('NO_BACKEND');
      err.code = 'NO_BACKEND';
      throw err;
    }

    var out = { text: result.text, source: result.source, at: new Date().toISOString() };
    writeCache(sym, out);
    return Object.assign({}, out, { cached: false });
  };
})();
