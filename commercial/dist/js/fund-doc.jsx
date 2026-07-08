/* ============================================================
   fund-doc.jsx — ใบสรุปการลงทุนรายคน (บันทึกภายในครอบครัว)
   Printable statement for the Partner Fund. Rendered as a
   portal overlay; @media print shows only the paper.
   Exports window.FundStatement.
   ============================================================ */
(function () {
  const { useState, useEffect } = React;
  const { Icon } = window;

  const fmtB = n => (n == null || isNaN(n)) ? '—' : '฿' + Math.round(n).toLocaleString('en-US');
  const fmtUsd = n => (n == null || isNaN(n)) ? '—' : '$' + Math.round(n).toLocaleString('en-US');
  const fmtU = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const thDate = iso => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d} ${months[m - 1]} ${y + 543}`;
  };
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function useDocStyles() {
    useEffect(() => {
      if (document.getElementById('fund-doc-styles')) return;
      const s = document.createElement('style');
      s.id = 'fund-doc-styles';
      s.textContent = `
        .fdoc-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);overflow:auto;padding:26px 14px}
        .fdoc-actions{max-width:760px;margin:0 auto 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .fdoc-actions .sp{flex:1}
        .fdoc-chip{padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;font-size:13px;cursor:pointer;font-family:inherit}
        .fdoc-chip.on{background:#fff;color:#111;font-weight:700;border-color:#fff}
        .fdoc-sel{padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.4);color:#fff;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;min-width:190px;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center;padding-right:34px}
        .fdoc-sel option{color:#111}
        .fdoc-paper{max-width:760px;margin:0 auto;background:#fff;color:#1a1a1a;border-radius:8px;padding:44px 48px;font-family:var(--font-sans,system-ui),sans-serif;line-height:1.7}
        .fdoc-paper .eyebrow{font-size:13px;color:#888;letter-spacing:.04em}
        .fdoc-paper h1{font-size:24px;margin:2px 0 2px;font-weight:800}
        .fdoc-paper .asof{font-size:14px;color:#555;margin-bottom:22px}
        .fdoc-hr{border:none;border-top:1.5px solid #222;margin:18px 0}
        .fdoc-hero{background:#f4f5f7;border-radius:10px;padding:20px 22px;margin:14px 0 18px}
        .fdoc-hero .who{font-size:15px;color:#555}
        .fdoc-hero .val{font-size:38px;font-weight:800;font-variant-numeric:tabular-nums;margin:2px 0}
        .fdoc-hero .pf{font-size:16px;font-weight:700}
        .fdoc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #ddd;border-radius:10px;overflow:hidden;margin-bottom:18px}
        .fdoc-grid>div{padding:13px 16px;border-right:1px solid #ddd}
        .fdoc-grid>div:last-child{border-right:none}
        .fdoc-grid .l{font-size:12.5px;color:#777;margin-bottom:2px}
        .fdoc-grid .v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}
        .fdoc-sec{font-size:15px;font-weight:800;margin:20px 0 8px}
        .fdoc-tbl{width:100%;border-collapse:collapse;font-size:14px}
        .fdoc-tbl th{font-size:12px;color:#777;text-align:left;font-weight:600;padding:7px 10px;border-bottom:1.5px solid #222}
        .fdoc-tbl td{padding:8px 10px;border-bottom:1px solid #e5e5e5;font-variant-numeric:tabular-nums}
        .fdoc-tbl .r{text-align:right}
        .fdoc-explain{font-size:14px;background:#fbf8ef;border:1px solid #eadfc0;border-radius:10px;padding:14px 18px;margin:16px 0}
        .fdoc-note{font-size:12.5px;color:#777;line-height:1.75;margin-top:18px}
        .fdoc-sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:38px}
        .fdoc-sign .ln{border-top:1px solid #333;padding-top:6px;font-size:13px;color:#555;text-align:center;margin-top:44px}
        .green2{color:#0a7a45} .red2{color:#c0392b}
        @media print {
          body > *:not(.fdoc-overlay){display:none !important}
          .fdoc-overlay{position:static;background:#fff;padding:0;overflow:visible}
          .fdoc-actions{display:none !important}
          .fdoc-paper{max-width:none;border-radius:0;padding:10mm 8mm;box-shadow:none}
          @page{size:A4;margin:12mm}
        }
      `;
      document.head.appendChild(s);
    }, []);
  }

  // props: onClose, partners, people(rows from partnerBreakdown), rows(unit rows),
  //        totalThb, totalUnits, fx, latestNlvUsd, latestDate, assets, accountName
  function FundStatement(props) {
    useDocStyles();
    const { onClose, partners, people, rows, totalThb, totalUnits, fx, latestNlvUsd, latestDate, assets, accountName } = props;
    const [pid, setPid] = useState(people.length ? people[0].partner_id : null);
    useEffect(() => {
      const onKey = e => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const nameOf = id => (partners.find(x => x.id === id) || {}).name || '—';
    const p = people.find(x => x.partner_id === pid) || people[0];
    if (!p) return null;
    const myRows = rows.filter(r => r.partner_id === p.partner_id);
    const nav = totalUnits > 0 ? totalThb / totalUnits : 1;
    const A = assets || {};
    const goldThb = (A.gold_qty || 0) * (A.gold_price_thb || 0);
    const stocksThb = (latestNlvUsd || 0) * fx;

    const doc = (
      <div className="fdoc-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="fdoc-actions">
          <label style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>ออกใบของ</label>
          <select className="fdoc-sel" value={p.partner_id} onChange={e => setPid(e.target.value)}>
            {people.map(x => <option key={x.partner_id} value={x.partner_id}>{nameOf(x.partner_id)}</option>)}
          </select>
          <span className="sp" />
          <button className="fdoc-chip" onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
          <button className="fdoc-chip" onClick={onClose}>ปิด</button>
        </div>

        <div className="fdoc-paper">
          <div className="eyebrow">บันทึกภายในครอบครัว · {accountName || 'กองทุนบ้านสิงห์ทอง · Baan Singthong Fund'}</div>
          <h1>ใบสรุปการลงทุนของ{nameOf(p.partner_id)}</h1>
          <div className="asof">ข้อมูล ณ วันที่ {thDate(todayISO())}</div>

          <div className="fdoc-hero">
            <div className="who">เงินของ{nameOf(p.partner_id)}ในกองตอนนี้มีมูลค่า</div>
            <div className="val">{fmtB(p.value)}</div>
            <div className={'pf ' + (p.profit >= 0 ? 'green2' : 'red2')}>
              {p.profit >= 0 ? 'กำไร ' : 'ขาดทุน '}{fmtB(Math.abs(p.profit))} นับตั้งแต่เริ่มลงทุน
            </div>
          </div>

          <div className="fdoc-grid">
            <div><div className="l">เงินที่ลงทุนไปทั้งหมด</div><div className="v">{fmtB(p.dep)}</div></div>
            <div><div className="l">ถอนคืนไปแล้ว</div><div className="v">{fmtB(p.wd)}</div></div>
            <div><div className="l">สัดส่วนในกอง</div><div className="v">{(p.share * 100).toFixed(1)}%</div></div>
          </div>

          <div className="fdoc-explain">
            <b>อ่านยังไง:</b> ลงทุนไป {fmtB(p.dep)} ถอนคืนแล้ว {fmtB(p.wd)} วันนี้เงินที่เหลือในกองมีค่า {fmtB(p.value)} —
            รวมแล้ว{p.profit >= 0 ? 'ได้กำไร' : 'ขาดทุน'} <b className={p.profit >= 0 ? 'green2' : 'red2'}>{fmtB(Math.abs(p.profit))}</b>
            {' '}({fmtB(p.value)} + {fmtB(p.wd)} − {fmtB(p.dep)})
          </div>

          <div className="fdoc-sec">ประวัติเงินเข้า-ออกของ{nameOf(p.partner_id)}</div>
          <table className="fdoc-tbl">
            <thead><tr><th>วันที่</th><th>รายการ</th><th className="r">จำนวนเงิน</th><th className="r">ราคา/หน่วย</th><th className="r">หน่วยที่ได้/คืน</th></tr></thead>
            <tbody>
              {myRows.map(r => (
                <tr key={r.id}>
                  <td>{thDate(r.date)}</td>
                  <td>{r.type === 'withdraw' ? 'ถอนเงินคืน' : 'ฝากเงินลงทุน'}</td>
                  <td className="r">{fmtB(r.amount_thb)}</td>
                  <td className="r">{r.price.toFixed(4)}</td>
                  <td className="r">{r.units >= 0 ? '+' : ''}{fmtU(r.units)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan="4" style={{ fontWeight: 700 }}>หน่วยลงทุนที่ถืออยู่ตอนนี้</td>
                <td className="r" style={{ fontWeight: 700 }}>{fmtU(p.units)} หน่วย</td>
              </tr>
            </tbody>
          </table>

          <div className="fdoc-sec">กองกลางทั้งหมดตอนนี้ (ของทุกคนรวมกัน)</div>
          <table className="fdoc-tbl">
            <tbody>
              <tr><td>หุ้น/ออปชันที่โบรกเกอร์ (IBKR) — {fmtUsd(latestNlvUsd)} × เรท {fx} <span style={{ color: '#999', fontSize: 12 }}>(ยอด ณ {thDate(latestDate)})</span></td><td className="r">{fmtB(stocksThb)}</td></tr>
              {goldThb > 0 && <tr><td>ทองคำ {A.gold_qty} บาททอง</td><td className="r">{fmtB(goldThb)}</td></tr>}
              {(A.thai_stocks_thb || 0) > 0 && <tr><td>พอร์ตหุ้นไทย</td><td className="r">{fmtB(A.thai_stocks_thb)}</td></tr>}
              {(A.cash_thb || 0) > 0 && <tr><td>เงินสดกองกลาง</td><td className="r">{fmtB(A.cash_thb)}</td></tr>}
              <tr>
                <td style={{ fontWeight: 800 }}>รวมทั้งกอง · ราคาต่อหน่วย {nav.toFixed(4)} บาท</td>
                <td className="r" style={{ fontWeight: 800 }}>{fmtB(totalThb)}</td>
              </tr>
            </tbody>
          </table>

          <table className="fdoc-tbl" style={{ marginTop: 10 }}>
            <thead><tr><th>ผู้ลงทุน</th><th className="r">สัดส่วน</th><th className="r">มูลค่าวันนี้</th></tr></thead>
            <tbody>
              {people.map(x => (
                <tr key={x.partner_id} style={x.partner_id === p.partner_id ? { background: '#f4f5f7', fontWeight: 700 } : null}>
                  <td>{nameOf(x.partner_id)}</td>
                  <td className="r">{(x.share * 100).toFixed(1)}%</td>
                  <td className="r">{fmtB(x.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="fdoc-note">
            หมายเหตุ: เอกสารนี้เป็นบันทึกภายในครอบครัวเพื่อความโปร่งใส ไม่ใช่เอกสารของสถาบันการเงิน ·
            มูลค่าเงินลงทุนขึ้นลงตามราคาตลาดทุกวัน ไม่ใช่เงินฝากประจำ และไม่มีการรับประกันผลตอบแทน ·
            มูลค่าคำนวณจากยอดพอร์ตโบรกเกอร์ ณ {thDate(latestDate)} ที่อัตราแลกเปลี่ยน {fx} บาท/ดอลลาร์
          </div>

          <div className="fdoc-sign">
            <div className="ln">ผู้ดูแลการลงทุน · วันที่ {thDate(todayISO())}</div>
            <div className="ln">ผู้ลงทุน ({nameOf(p.partner_id)})</div>
          </div>
        </div>
      </div>
    );

    return ReactDOM.createPortal(doc, document.body);
  }

  window.FundStatement = FundStatement;
})();
