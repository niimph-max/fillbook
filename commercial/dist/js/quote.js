/* ============================================================
   quote.js — จุดเดียวสำหรับดึงราคาหุ้นสด (live quote)
   ------------------------------------------------------------
   เรียกผ่าน Supabase Edge Function ชื่อ `quote` ซึ่งเก็บ
   Finnhub API key ไว้เป็น secret ฝั่ง server — ไม่มี key ใน
   โค้ดฝั่ง client เลย ต้องล็อกอินก่อน (invoke ส่ง JWT ให้เอง)
   คืนค่า = Finnhub /quote: { c, d, dp, h, l, o, pc }
   ============================================================ */
(function () {
  async function viaProxy(symbol) {
    var sb = window.sbClient;
    if (!sb || !sb.functions) return null;
    try {
      var res = await sb.functions.invoke('quote', { body: { symbol: symbol } });
      if (res && !res.error && res.data && res.data.c != null) return res.data;
    } catch (e) { /* ignore — quote just won't update */ }
    return null;
  }

  // window.fetchQuote(symbol) → Promise<{ c, ... }>  (คืน {} ถ้าดึงไม่ได้)
  window.fetchQuote = async function (symbol) {
    symbol = (symbol || '').toString().toUpperCase().trim();
    if (!symbol) return {};
    var q = await viaProxy(symbol);
    return q || {};
  };
})();
