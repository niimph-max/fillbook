/* ============================================================
   fund-calc.js — Partner Fund (กองหุ้นส่วน) unit/NAV logic.
   Ported 1:1 from สมุดหุ้นส่วน.html so results match exactly.
   Pure functions, no DOM. Exports window.FundCalc.

   Transaction shape (Supabase fund_transactions):
     { partner_id, date:'YYYY-MM-DD', type:'deposit'|'withdraw',
       amount_thb:Number, nlv_before_thb:Number, seq:Number }
   ============================================================ */
(function () {
  const COLORS = ['#5B9DFF', '#E58BE5', '#F5B84B', '#4FD1B5', '#FF8A70', '#A78BFA', '#F472B6', '#34D399'];

  // ปันส่วนราคา/หน่วย ตามลำดับ date, seq:
  //  - หน่วยรวมสะสม <= 0  → ราคา 1 (รายการแรก)
  //  - วันเดียวกับรายการก่อนหน้า → ราคาเดียวกัน
  //  - วันใหม่ → nlv_before_thb ÷ หน่วยรวมสะสม (ก่อนรายการนี้)
  function computeUnits(txns) {
    const sorted = [...(txns || [])].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) || ((a.seq || 0) - (b.seq || 0)));
    let total = 0, lastDate = null, lastPrice = 1;
    const rows = [];
    for (const t of sorted) {
      let price;
      if (total <= 0) price = 1;
      else if (t.date === lastDate) price = lastPrice;
      else price = t.nlv_before_thb / total;
      const sign = t.type === 'withdraw' ? -1 : 1;
      const units = sign * (t.amount_thb / price);
      total += units; lastDate = t.date; lastPrice = price;
      rows.push({ ...t, price, units });
    }
    return { rows, totalUnits: total };
  }

  // สรุปรายคน (key = partner_id): หน่วยรวม, ฝากสะสม, ถอนสะสม
  function aggregate(rows) {
    const m = new Map();
    for (const r of rows) {
      const k = r.partner_id;
      if (!m.has(k)) m.set(k, { partner_id: k, units: 0, dep: 0, wd: 0 });
      const p = m.get(k);
      p.units += r.units;
      if (r.type === 'withdraw') p.wd += r.amount_thb; else p.dep += r.amount_thb;
    }
    return [...m.values()];
  }

  // มูลค่ากองรวม (บาท) = NLV ล่าสุด(USD) × fx + หุ้นไทย + ทอง + เงินสด
  function fundTotalThb(latestNlvUsd, fxRate, assets) {
    const a = assets || {};
    return (latestNlvUsd || 0) * (fxRate || 0)
      + (a.thai_stocks_thb || 0)
      + (a.gold_qty || 0) * (a.gold_price_thb || 0)
      + (a.cash_thb || 0);
  }

  // มูลค่า + กำไรสุทธิรายคน ที่มูลค่ากองที่กำหนด
  //  สัดส่วน = units ÷ totalUnits · มูลค่า = สัดส่วน × กอง
  //  กำไรสุทธิ = มูลค่า + ถอนสะสม − ฝากสะสม
  function partnerBreakdown(rows, totalUnits, totalThb) {
    return aggregate(rows).map(p => {
      const share = totalUnits > 0 ? p.units / totalUnits : 0;
      const value = share * totalThb;
      return { ...p, share, value, profit: value + p.wd - p.dep };
    });
  }

  window.FundCalc = { COLORS, computeUnits, aggregate, fundTotalThb, partnerBreakdown };
})();
