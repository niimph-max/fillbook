/* ============================================================
   quote.js — จุดเดียวสำหรับดึงราคาหุ้นสด (live quote)
   ------------------------------------------------------------
   เรียกผ่าน Supabase Edge Function ชื่อ `quote` ซึ่งเก็บ
   Finnhub API key ไว้เป็น "secret" ฝั่ง server (ไม่โผล่ในโค้ด)
   มี fallback ยิงตรง Finnhub ไว้ชั่วคราว — ใช้ได้จนกว่าจะ deploy
   Edge Function เสร็จ พอยืนยันว่าใช้ได้แล้ว ให้ลบ FALLBACK_KEY
   และ viaDirect ทิ้ง แล้ว key จะหายจาก client ทั้งหมด
   รูปแบบที่คืน = Finnhub /quote: { c, d, dp, h, l, o, pc }
   ============================================================ */
(function () {
  // ⚠️ ชั่วคราว — ลบทิ้งหลัง Edge Function `quote` ใช้งานได้แล้ว
  var FALLBACK_KEY = 'd8ods19r01qrbffl14v0d8ods19r01qrbffl14vg';

  async function viaProxy(symbol) {
    var sb = window.sbClient;
    if (!sb || !sb.functions) return null;
    try {
      var res = await sb.functions.invoke('quote', { body: { symbol: symbol } });
      if (res && !res.error && res.data && res.data.c != null) return res.data;
    } catch (e) { /* fall through */ }
    return null;
  }

  async function viaDirect(symbol) {
    if (!FALLBACK_KEY) throw new Error('no quote source');
    var r = await fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + FALLBACK_KEY);
    return await r.json();
  }

  // window.fetchQuote(symbol) → Promise<{ c, ... }>
  window.fetchQuote = async function (symbol) {
    symbol = (symbol || '').toString().toUpperCase().trim();
    if (!symbol) return {};
    var p = await viaProxy(symbol);
    if (p) return p;
    return await viaDirect(symbol);
  };
})();
