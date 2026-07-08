/* ============================================================
   fund.jsx — Partner Fund (กองหุ้นส่วน) for the Dad&Mom account.
   NAV-based unit accounting in THB. Data lives in Supabase
   (funds / fund_partners / fund_transactions / fund_assets).
   IBKR USD is pulled live from the account's latest Daily NLV.
   Exports window.FundPage. Isolated — touches nothing else.
   ============================================================ */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const { Icon } = window;
  const FC = window.FundCalc;
  const FUND_BRAND = 'กองทุนบ้านสิงห์ทอง · Baan Singthong Fund';

  const fmtB = n => (n == null || isNaN(n)) ? '—' : '฿' + Math.round(n).toLocaleString('en-US');
  const fmtBs = n => (n == null || isNaN(n)) ? '—' : (n >= 0 ? '+' : '−') + '฿' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const fmtUsd = n => (n == null || isNaN(n)) ? '—' : '$' + Math.round(n).toLocaleString('en-US');
  const fmtPct = n => (n * 100).toFixed(1) + '%';
  const fmtU = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);

  // one-time scoped styles
  function useFundStyles() {
    useEffect(() => {
      if (document.getElementById('fund-styles')) return;
      const s = document.createElement('style');
      s.id = 'fund-styles';
      s.textContent = `
        .fund-wrap{width:100%;max-width:760px;margin:0 auto;padding-bottom:40px}
        .fund-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}
        .fund-nlv{font-family:var(--font-mono,monospace);font-size:34px;font-weight:600;line-height:1.1}
        .fund-eyebrow{font-size:12px;letter-spacing:.06em;color:var(--text-faint);margin-bottom:4px}
        .fund-sub{font-size:12px;color:var(--text-faint);margin-top:3px}
        .fund-rate{display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:var(--surface-2);border:1px solid var(--border-soft);border-radius:10px;padding:9px 13px;margin-bottom:14px;font-size:13px;color:var(--text-dim)}
        .fund-rate input{width:92px;background:var(--surface);border:1px solid var(--border);border-radius:7px;color:var(--text);padding:6px 9px;font-size:14px;font-family:var(--font-mono,monospace)}
        .fund-bar{display:flex;height:15px;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--border-soft)}
        .fund-bar>div{height:100%}
        .fund-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;margin-bottom:20px;font-size:13px;color:var(--text-dim)}
        .fund-legend span.it{display:inline-flex;align-items:center;gap:7px}
        .fund-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0}
        .fund-tabs{display:flex;gap:6px;margin-bottom:16px}
        .fund-tab{flex:1;padding:10px 4px;border-radius:9px;border:1px solid var(--border-soft);background:transparent;color:var(--text-faint);font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px}
        .fund-tab.on{background:var(--accent-soft);color:var(--text);border-color:var(--accent-line);font-weight:600}
        .fund-pcard{border-left:3px solid var(--accent)}
        .fund-pcard .ph{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .fund-big{font-family:var(--font-mono,monospace);font-size:24px;font-weight:600}
        .fund-mini{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:13px;margin-top:10px}
        .fund-mini .l{font-size:11px;color:var(--text-faint);margin-bottom:2px}
        .fund-note{font-size:12px;color:var(--text-faint);line-height:1.65;margin-top:6px}
        .fund-tx{display:flex;align-items:center;gap:11px;background:var(--surface-2);border:1px solid var(--border-soft);border-radius:11px;padding:10px 13px;margin-bottom:8px}
        .fund-tx .info{flex:1;min-width:0;font-size:14px}
        .fund-tx .meta{font-size:11px;color:var(--text-faint);font-family:var(--font-mono,monospace);margin-top:2px}
        .fund-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px}
        .fund-warn{display:flex;gap:8px;align-items:flex-start;background:rgba(245,184,75,.1);border:1px solid rgba(245,184,75,.35);color:#f5b84b;border-radius:9px;padding:9px 12px;font-size:12.5px;line-height:1.55;margin-bottom:12px}
        .fund-row-sb{display:flex;justify-content:space-between;margin-bottom:7px;font-size:13px}
        .green{color:var(--pos-bright,#4ade80)} .red{color:var(--neg-bright,#f87171)}
        @media(max-width:560px){.fund-form{grid-template-columns:1fr}.fund-mini{grid-template-columns:1fr 1fr}}
      `;
      document.head.appendChild(s);
    }, []);
  }

  // ---- Supabase-backed fund store hook -------------------------------------
  function useFund(accountId) {
    const sb = window.sbClient;
    const [state, setState] = useState({ loading: true, error: null, fund: null, partners: [], txns: [], assets: null });
    const busy = useRef(false);

    const reloadChildren = useCallback(async (fundId) => {
      const [{ data: partners }, { data: txns }, { data: assets }] = await Promise.all([
        sb.from('fund_partners').select('*').eq('fund_id', fundId),
        sb.from('fund_transactions').select('*').eq('fund_id', fundId),
        sb.from('fund_assets').select('*').eq('fund_id', fundId).maybeSingle(),
      ]);
      return {
        partners: partners || [],
        txns: txns || [],
        assets: assets || { fund_id: fundId, thai_stocks_thb: 0, gold_qty: 0, gold_price_thb: 0, cash_thb: 0 },
      };
    }, [sb]);

    const load = useCallback(async () => {
      if (!sb) { setState(s => ({ ...s, loading: false, error: 'NO_CLOUD' })); return; }
      try {
        let { data: fund, error } = await sb.from('funds').select('*').eq('account_id', accountId).maybeSingle();
        if (error) throw error;
        if (!fund) {
          // first-time setup: create fund + seed partners/transactions/assets
          const { data: created, error: e2 } = await sb.from('funds').insert({ account_id: accountId, fx_rate: 32.5 }).select().single();
          if (e2) throw e2;
          fund = created;
          const seedPartners = [
            { fund_id: fund.id, name: 'ปฐมพร ลิ้นทอง', color: FC.COLORS[0] },
            { fund_id: fund.id, name: 'พุทรา ลิ้นทอง', color: FC.COLORS[1] },
            { fund_id: fund.id, name: 'นวลจันทร์ ลิ้นทอง', color: FC.COLORS[2] },
          ];
          const { data: ps } = await sb.from('fund_partners').insert(seedPartners).select();
          const byName = {}; (ps || []).forEach(p => byName[p.name] = p.id);
          const seedTx = [
            { date: '2025-11-03', type: 'deposit', pn: 'ปฐมพร ลิ้นทอง', amount_thb: 300000, nlv_before_thb: 600000, seq: 1 },
            { date: '2025-11-03', type: 'deposit', pn: 'พุทรา ลิ้นทอง', amount_thb: 150000, nlv_before_thb: 600000, seq: 2 },
            { date: '2025-11-03', type: 'deposit', pn: 'นวลจันทร์ ลิ้นทอง', amount_thb: 150000, nlv_before_thb: 600000, seq: 3 },
            { date: '2026-04-15', type: 'withdraw', pn: 'ปฐมพร ลิ้นทอง', amount_thb: 75000, nlv_before_thb: 750000, seq: 4 },
            { date: '2026-04-15', type: 'withdraw', pn: 'พุทรา ลิ้นทอง', amount_thb: 37500, nlv_before_thb: 750000, seq: 5 },
            { date: '2026-04-15', type: 'withdraw', pn: 'นวลจันทร์ ลิ้นทอง', amount_thb: 37500, nlv_before_thb: 750000, seq: 6 },
          ].map(t => ({ fund_id: fund.id, partner_id: byName[t.pn], date: t.date, type: t.type, amount_thb: t.amount_thb, nlv_before_thb: t.nlv_before_thb, seq: t.seq }));
          await sb.from('fund_transactions').insert(seedTx);
          await sb.from('fund_assets').insert({ fund_id: fund.id, thai_stocks_thb: 0, gold_qty: 0, gold_price_thb: 0, cash_thb: 0 });
        }
        const kids = await reloadChildren(fund.id);
        setState({ loading: false, error: null, fund, ...kids });
      } catch (e) {
        console.error('fund load failed', e);
        setState(s => ({ ...s, loading: false, error: (e && e.message) || 'error' }));
      }
    }, [sb, accountId, reloadChildren]);

    useEffect(() => { setState(s => ({ ...s, loading: true })); load(); }, [load]);

    const refresh = useCallback(async () => {
      if (!state.fund) return;
      const kids = await reloadChildren(state.fund.id);
      setState(s => ({ ...s, ...kids }));
    }, [state.fund, reloadChildren]);

    // ---- mutations ----
    const setFx = useCallback(async (v) => {
      if (!state.fund || !(v > 0)) return;
      setState(s => ({ ...s, fund: { ...s.fund, fx_rate: v } }));
      await sb.from('funds').update({ fx_rate: v }).eq('id', state.fund.id);
    }, [sb, state.fund]);

    const setAssets = useCallback(async (patch) => {
      if (!state.fund) return;
      const next = { ...state.assets, ...patch, fund_id: state.fund.id };
      setState(s => ({ ...s, assets: next }));
      await sb.from('fund_assets').upsert(next, { onConflict: 'fund_id' });
    }, [sb, state.fund, state.assets]);

    const ensurePartner = useCallback(async (name) => {
      const found = state.partners.find(p => p.name === name);
      if (found) return found.id;
      const color = FC.COLORS[state.partners.length % FC.COLORS.length];
      const { data } = await sb.from('fund_partners').insert({ fund_id: state.fund.id, name, color }).select().single();
      return data.id;
    }, [sb, state.partners, state.fund]);

    const addTxn = useCallback(async ({ date, name, type, amount_thb, nlv_before_thb }) => {
      const partner_id = await ensurePartner(name);
      const seq = Math.max(0, ...state.txns.map(t => t.seq || 0)) + 1;
      await sb.from('fund_transactions').insert({ fund_id: state.fund.id, partner_id, date, type, amount_thb, nlv_before_thb, seq });
      await refresh();
    }, [sb, ensurePartner, state.txns, state.fund, refresh]);

    const deleteTxn = useCallback(async (id) => {
      setState(s => ({ ...s, txns: s.txns.filter(t => t.id !== id) }));
      await sb.from('fund_transactions').delete().eq('id', id);
    }, [sb]);

    return { ...state, setFx, setAssets, addTxn, deleteTxn, reload: load };
  }

  // ---- inline editable rate ------------------------------------------------
  function RateInput({ value, onCommit }) {
    const [v, setV] = useState(value);
    useEffect(() => { setV(value); }, [value]);
    return (
      <input type="number" inputMode="decimal" step="0.01" value={v == null ? '' : v}
        onChange={e => setV(e.target.value === '' ? '' : parseFloat(e.target.value))}
        onBlur={() => onCommit(v)}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
    );
  }

  // ---- Summary view --------------------------------------------------------
  function SummaryView({ people, totalThb, fx, partnerName, color }) {
    if (!people.length) return <div className="fund-note">ยังไม่มีหุ้นส่วน — เพิ่มรายการฝากในแท็บ “เงินเข้า-ออก”</div>;
    return (
      <>
        {people.map(p => (
          <div key={p.partner_id} className="card card-pad fund-pcard" style={{ borderLeftColor: color(p.partner_id), marginBottom: 12 }}>
            <div className="ph">
              <span style={{ fontWeight: 700, fontSize: 17 }}>{partnerName(p.partner_id)}</span>
              <span className="num" style={{ fontSize: 15, color: color(p.partner_id) }}>{fmtPct(p.share)}</span>
            </div>
            <div className="fund-big">{fmtB(p.value)}</div>
            <div className="fund-sub">≈ {fmtUsd(p.value / fx)}</div>
            <div className="fund-mini">
              <div><div className="l">ลงทุนสะสม</div><div className="num">{fmtB(p.dep)}</div></div>
              <div><div className="l">ถอนแล้ว</div><div className="num">{fmtB(p.wd)}</div></div>
              <div><div className="l">กำไรสุทธิ</div><div className={'num ' + (p.profit >= 0 ? 'green' : 'red')}>{fmtBs(p.profit)}</div></div>
            </div>
          </div>
        ))}
        <div className="fund-note">กำไรสุทธิ = มูลค่าวันนี้ + ที่ถอนไปแล้ว − ที่ลงทุนไป (คิดเป็นบาททั้งหมด กำไร/ขาดทุนค่าเงินรวมอยู่แล้ว) · คนใหม่เข้าร่วม แค่เพิ่มรายการฝากด้วยชื่อใหม่ในแท็บถัดไป</div>
      </>
    );
  }

  // ---- Transactions view ---------------------------------------------------
  function TxView({ fund, partners, rows, people, totalUnits, currentTotalThb, color, partnerName, staleDays, onAdd, onDelete }) {
    const [date, setDate] = useState(todayISO());
    const [name, setName] = useState('');
    const [type, setType] = useState('deposit');
    const [amt, setAmt] = useState('');
    const [nlv, setNlv] = useState('');
    const [err, setErr] = useState('');
    const [pendingDel, setPendingDel] = useState(null);

    const useCurrent = () => setNlv(String(Math.round(currentTotalThb)));

    const submit = () => {
      setErr('');
      const amount = parseFloat(amt), nlvB = parseFloat(nlv);
      const nm = name.trim();
      if (!date || !nm) return setErr('กรอกวันที่และชื่อก่อนครับ');
      if (!(amount > 0)) return setErr('จำนวนเงินต้องมากกว่า 0');
      if (!(nlvB > 0)) return setErr('ใส่มูลค่ากองรวมก่อนรายการ หรือกดปุ่ม “ใช้มูลค่ากองปัจจุบัน”');
      if (type === 'withdraw') {
        const price = totalUnits > 0 ? nlvB / totalUnits : 1;
        const pid = (partners.find(p => p.name === nm) || {}).id;
        const held = pid ? (people.find(x => x.partner_id === pid) || {}).units || 0 : 0;
        if (amount / price > held + 0.01) return setErr('ถอนเกินมูลค่าที่ ' + nm + ' ถืออยู่');
      }
      onAdd({ date, name: nm, type, amount_thb: amount, nlv_before_thb: nlvB });
      setName(''); setAmt('');
    };

    return (
      <>
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>เพิ่มรายการ <span className="fund-note" style={{ marginTop: 0 }}>(คิดเป็นบาททั้งหมด)</span></div>
          {staleDays > 2 && (
            <div className="fund-warn"><Icon name="alert" size={15} /><span>Daily NLV ล่าสุดเก่ากว่า {staleDays} วัน — “ใช้มูลค่ากองปัจจุบัน” อาจไม่ตรงจริง อัปเดต Daily NLV / เรท / ราคาทอง ให้เป็นของวันนั้นก่อนบันทึก</span></div>
          )}
          <div className="fund-form">
            <label className="field"><label>วันที่</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="field"><label>ชื่อ (พิมพ์ชื่อใหม่ได้)</label><input className="input" list="fund-names" value={name} onChange={e => setName(e.target.value)} placeholder="ปฐมพร / พุทรา / นวลจันทร์ / ชื่อใหม่" /><datalist id="fund-names">{partners.map(p => <option key={p.id} value={p.name} />)}</datalist></label>
            <label className="field"><label>ประเภท</label><select className="select" value={type} onChange={e => setType(e.target.value)}><option value="deposit">ฝาก (เงินเข้า)</option><option value="withdraw">ถอน (เงินออก)</option></select></label>
            <label className="field"><label>จำนวน (บาท)</label><input className="input num" type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} placeholder="100000" /></label>
          </div>
          <label className="field" style={{ marginBottom: 10, display: 'block' }}><label>มูลค่ากองรวมก่อนรายการ (บาท)</label><input className="input num" type="number" inputMode="decimal" value={nlv} onChange={e => setNlv(e.target.value)} /></label>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={useCurrent}><Icon name="reset" size={13} />ใช้มูลค่ากองปัจจุบัน ({fmtB(currentTotalThb)})</button>
          {err && <div className="red" style={{ fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={submit}><Icon name="plus" size={15} />บันทึกรายการ</button>
          <div className="fund-note">หลายคนโอนวันเดียวกัน → ใช้มูลค่ากองตัวเดียวกันทุกรายการ · หน่วยจะคิดราคาเดียวกันให้อัตโนมัติ</div>
        </div>
        {[...rows].reverse().map(r => (
          <div key={r.id} className="fund-tx">
            <span className="fund-dot" style={{ background: color(r.partner_id) }} />
            <div className="info">
              <div><b>{partnerName(r.partner_id)}</b> {r.type === 'withdraw' ? 'ถอน' : 'ฝาก'} <b className="num">{fmtB(r.amount_thb)}</b></div>
              <div className="meta">{r.date} · ราคา/หน่วย {r.price.toFixed(4)}฿ · {r.units >= 0 ? '+' : ''}{fmtU(r.units)} หน่วย</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--neg-bright)', flexShrink: 0 }}
              onClick={() => { if (pendingDel === r.id) { onDelete(r.id); setPendingDel(null); } else { setPendingDel(r.id); setTimeout(() => setPendingDel(p => p === r.id ? null : p), 4000); } }}>
              {pendingDel === r.id ? 'ยืนยันลบ?' : 'ลบ'}
            </button>
          </div>
        ))}
      </>
    );
  }

  // ---- Assets view ---------------------------------------------------------
  function AssetsView({ assets, fx, latestNlvUsd, latestDate, staleDays, totalThb, onSet }) {
    const A = assets || {};
    const NumRow = ({ label, hint, field, step }) => {
      const [v, setV] = useState(A[field]);
      useEffect(() => { setV(A[field]); }, [A[field]]);
      return (
        <label className="field" style={{ display: 'block' }}>
          <label>{label}{hint && <span className="hint"> {hint}</span>}</label>
          <input className="input num" type="number" inputMode="decimal" step={step || 'any'} value={v == null ? '' : v}
            onChange={e => setV(e.target.value === '' ? '' : parseFloat(e.target.value))}
            onBlur={() => { const n = parseFloat(v); if (!isNaN(n) && n >= 0) onSet({ [field]: n }); }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
        </label>
      );
    };
    return (
      <div className="card card-pad">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>สินทรัพย์ในกองกลาง</div>
        {staleDays > 2 && (
          <div className="fund-warn"><Icon name="alert" size={15} /><span>Daily NLV ล่าสุด ({latestDate || '—'}) เก่ากว่า {staleDays} วัน — มูลค่าหุ้น/ออปชันอาจไม่เป็นปัจจุบัน อัปเดตที่หน้า Daily NLV</span></div>
        )}
        <div className="field" style={{ display: 'block', marginBottom: 6 }}>
          <label>1) หุ้น/ออปชัน — NLV จาก IBKR (USD) <span className="hint">อัตโนมัติจาก Daily NLV ล่าสุด</span></label>
          <div className="input num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', color: 'var(--text-dim)' }}>
            <span>{fmtUsd(latestNlvUsd)}</span>
            <span className="fund-note" style={{ margin: 0 }}>{latestDate || 'ยังไม่มีข้อมูล'}</span>
          </div>
        </div>
        <div style={{ height: 10 }} />
        <NumRow label="2) พอร์ตหุ้นไทย (บาท)" hint="มูลค่าตลาดวันนี้ — กรอกเอง/อัปเดตเมื่อราคาเปลี่ยน" field="thai_stocks_thb" />
        <div style={{ height: 10 }} />
        <div className="fund-form" style={{ marginBottom: 0 }}>
          <NumRow label="3) ทองคำ (บาททอง)" field="gold_qty" step="0.01" />
          <NumRow label="ราคารับซื้อคืน (฿/บาททอง)" field="gold_price_thb" />
        </div>
        <div style={{ height: 10 }} />
        <NumRow label="4) เงินสดกองกลางที่ยังไม่ได้ลงทุน (บาท)" field="cash_thb" />
        <div style={{ marginTop: 14, background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: 13 }}>
          <div className="fund-row-sb"><span style={{ color: 'var(--text-faint)' }}>หุ้น/ออปชัน (IBKR) {fmtUsd(latestNlvUsd)} × {fx}</span><b className="num">{fmtB((latestNlvUsd || 0) * fx)}</b></div>
          {(A.thai_stocks_thb || 0) > 0 && <div className="fund-row-sb"><span style={{ color: 'var(--text-faint)' }}>พอร์ตหุ้นไทย</span><b className="num">{fmtB(A.thai_stocks_thb || 0)}</b></div>}
          <div className="fund-row-sb"><span style={{ color: 'var(--text-faint)' }}>ทองคำ {A.gold_qty || 0} บาททอง</span><b className="num">{fmtB((A.gold_qty || 0) * (A.gold_price_thb || 0))}</b></div>
          <div className="fund-row-sb"><span style={{ color: 'var(--text-faint)' }}>เงินสดกองกลาง</span><b className="num">{fmtB(A.cash_thb || 0)}</b></div>
          <div className="fund-row-sb" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 8, marginBottom: 0 }}><span style={{ fontWeight: 600 }}>มูลค่ากองรวม</span><b className="num" style={{ color: 'var(--accent-2)' }}>{fmtB(totalThb)}</b></div>
        </div>
        <div className="fund-note" style={{ marginTop: 12 }}>ย้ายเงินระหว่างสินทรัพย์ (เช่น เอาเงินสดไปซื้อทอง หรือหุ้นไทย) = แก้ตัวเลขช่องเหล่านี้ ไม่ต้องบันทึกฝาก-ถอน เพราะเงินไม่ได้ออกจากกอง · เอาหุ้นไทยเข้ากองครั้งแรก = บันทึกฝากที่แท็บ “เงินเข้า-ออก” ด้วยมูลค่าตลาดวันนี้ แล้วมาใส่ยอดตรงนี้</div>
      </div>
    );
  }

  // ---- Page ----------------------------------------------------------------
  function FundPage() {
    useFundStyles();
    const st = window.useStore();
    const accountId = window.Store.getCurrentPortfolio();
    const F = useFund(accountId);
    const [tab, setTab] = useState('summary');
    const [showDoc, setShowDoc] = useState(false);

    // latest Daily NLV (USD) of this account
    const daily = (st.daily || []).filter(d => d && d.date && d.nlv != null).sort((a, b) => a.date.localeCompare(b.date));
    const latest = daily.length ? daily[daily.length - 1] : null;
    const latestNlvUsd = latest ? latest.nlv : 0;
    const latestDate = latest ? latest.date : null;
    const staleDays = latestDate ? daysBetween(latestDate, todayISO()) : 999;

    if (!window.sbClient || F.error === 'NO_CLOUD') {
      return <div className="fund-wrap"><div className="card card-pad fund-note">กองหุ้นส่วนต้องใช้บัญชีคลาวด์ (ล็อกอิน) — โหมดบันทึกในเครื่องยังไม่รองรับ</div></div>;
    }
    if (F.loading) return <div className="fund-wrap"><div className="card card-pad">กำลังโหลดกองหุ้นส่วน…</div></div>;
    if (F.error) {
      const needsTables = /relation|does not exist|schema cache|table/i.test(String(F.error));
      return <div className="fund-wrap"><div className="card card-pad">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>เชื่อมต่อกองหุ้นส่วนไม่ได้</div>
        <div className="fund-note">{needsTables ? 'ยังไม่ได้สร้างตารางใน Supabase — รันไฟล์ supabase/partner_fund.sql ใน SQL Editor ก่อน แล้วรีเฟรช' : String(F.error)}</div>
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={F.reload}><Icon name="reset" size={13} />ลองอีกครั้ง</button>
      </div></div>;
    }

    const fx = F.fund.fx_rate || 32.5;
    const { rows, totalUnits } = FC.computeUnits(F.txns);
    const totalThb = FC.fundTotalThb(latestNlvUsd, fx, F.assets);
    const people = FC.partnerBreakdown(rows, totalUnits, totalThb).sort((a, b) => b.units - a.units);
    const nameOf = id => (F.partners.find(p => p.id === id) || {}).name || '—';
    const colorMap = {}; F.partners.forEach((p, i) => colorMap[p.id] = p.color || FC.COLORS[i % FC.COLORS.length]);
    const color = id => colorMap[id] || 'var(--accent)';
    const nav = totalUnits > 0 ? totalThb / totalUnits : 1;

    return (
      <div className="fund-wrap">
        <div className="fund-hero">
          <div>
            <div className="fund-eyebrow">{FUND_BRAND} · สมุดหุ้นส่วน</div>
            <div className="fund-nlv">{fmtB(totalThb)}</div>
            <div className="fund-sub">≈ {fmtUsd(totalThb / fx)} · NAV/หน่วย {nav.toFixed(4)} บาท · {Math.round(totalUnits).toLocaleString('en-US')} หน่วย</div>
          </div>
          <button className="btn btn-sm" onClick={() => setShowDoc(true)} title="ออกใบสรุปการลงทุนรายคน พิมพ์/เซฟ PDF ได้">
            <Icon name="summary" size={14} />ออกเอกสาร
          </button>
        </div>

        <div className="fund-rate">
          <span style={{ color: 'var(--text-faint)' }}>เรทวันนี้</span>
          <RateInput value={fx} onCommit={F.setFx} />
          <span style={{ color: 'var(--text-faint)' }}>฿/USD — แก้เมื่อเรทเปลี่ยน มูลค่าหุ้น IBKR จะแปลงเป็นบาทใหม่ทันที</span>
        </div>

        <div className="fund-bar">
          {people.map(p => <div key={p.partner_id} style={{ width: totalUnits > 0 ? fmtPct(p.units / totalUnits) : '0%', background: color(p.partner_id) }} />)}
        </div>
        <div className="fund-legend">
          {people.map(p => <span key={p.partner_id} className="it"><span className="fund-dot" style={{ background: color(p.partner_id) }} />{nameOf(p.partner_id)} <b className="num">{fmtPct(totalUnits > 0 ? p.units / totalUnits : 0)}</b></span>)}
        </div>

        <div className="fund-tabs">
          <button className={'fund-tab' + (tab === 'summary' ? ' on' : '')} onClick={() => setTab('summary')}><Icon name="summary" size={14} />สรุปสัดส่วน</button>
          <button className={'fund-tab' + (tab === 'txs' ? ' on' : '')} onClick={() => setTab('txs')}><Icon name="wallet" size={14} />เงินเข้า-ออก</button>
          <button className={'fund-tab' + (tab === 'assets' ? ' on' : '')} onClick={() => setTab('assets')}><Icon name="coins" size={14} />สินทรัพย์</button>
        </div>

        {tab === 'summary' && <SummaryView people={people} totalThb={totalThb} fx={fx} partnerName={nameOf} color={color} />}
        {tab === 'txs' && <TxView fund={F.fund} partners={F.partners} rows={rows} people={people} totalUnits={totalUnits} currentTotalThb={totalThb} color={color} partnerName={nameOf} staleDays={staleDays} onAdd={F.addTxn} onDelete={F.deleteTxn} />}
        {tab === 'assets' && <AssetsView assets={F.assets} fx={fx} latestNlvUsd={latestNlvUsd} latestDate={latestDate} staleDays={staleDays} totalThb={totalThb} onSet={F.setAssets} />}

        {showDoc && window.FundStatement && (
          <window.FundStatement
            onClose={() => setShowDoc(false)}
            partners={F.partners} people={people} rows={rows}
            totalThb={totalThb} totalUnits={totalUnits} fx={fx}
            latestNlvUsd={latestNlvUsd} latestDate={latestDate}
            assets={F.assets}
            accountName={FUND_BRAND}
          />
        )}
      </div>
    );
  }

  window.FundPage = FundPage;
})();
