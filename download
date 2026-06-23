/* ============================================================
   watchlist.jsx — neutral price watchlist (sellable build).
   No prescriptive buy/sell signals — each trader uses their own
   strategy. Tracks price + % today (auto), user-set entry/stop
   alerts, and free-form notes.
   window.WL kept API-compatible (grade is a no-op) so the
   sidebar alert/badge components keep working.
   ============================================================ */
(function () {
  const { useState, useMemo, useEffect, useRef } = React;
  const { Icon, Card, Drawer, Field } = window;
  const T = window.TL;

  // fetch latest price + % change from Twelve Data
  async function fetchTD(ticker, key) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=2&apikey=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d || d.status === 'error' || !Array.isArray(d.values) || !d.values.length) {
      throw new Error(d && d.message ? d.message : 'no data');
    }
    // newest→oldest
    const closes = d.values.map(v => parseFloat(v.close));
    const price = closes[0];
    const prev = closes.length > 1 ? closes[1] : price;
    return { currentPrice: +price.toFixed(2), pctToday: prev ? +(((price - prev) / prev) * 100).toFixed(2) : null };
  }

  // neutral "grade" — no signal verdict (kept for API compatibility)
  function grade() { return { g: null, label: '', sub: '', active: false }; }

  // price alerts the USER defines: entry zone, stop, big move
  function priceAlerts(w) {
    const a = [];
    const p = w.currentPrice;
    if (p != null && w.target != null && p <= w.target) a.push({ kind: 'target', text: `ถึงโซน entry ≤ ${T.fmtNum(w.target, 2)}` });
    if (p != null && w.stop != null && p <= w.stop)     a.push({ kind: 'stop',   text: `หลุด stop ≤ ${T.fmtNum(w.stop, 2)}` });
    if (w.pctToday != null && Math.abs(w.pctToday) >= 5) a.push({ kind: 'move', text: `${w.pctToday > 0 ? '+' : ''}${w.pctToday.toFixed(1)}% วันนี้` });
    return a;
  }

  window.WL = { grade, priceAlerts, GRADES: {} };

  // ---- form -----------------------------------------------------------
  const blank = { ticker: '', note: '', target: null, stop: null, currentPrice: null, pctToday: null };

  function WatchForm({ initial, onSave, onDelete, onClose }) {
    const [f, setF] = useState(() => ({ ...blank, ...(initial && initial !== 'new' ? initial : {}) }));
    const [copied, setCopied] = useState(false);
    const [preview, setPreview] = useState(null);
    const taRef = useRef(null);
    const set = (k, v) => setF(s => ({ ...s, [k]: v }));
    const num = (k) => (e) => { const v = e.target.value; set(k, v === '' ? null : parseFloat(v)); };
    const save = () => {
      if (!f.ticker.trim()) return;
      onSave({ ...f, ticker: f.ticker.toUpperCase().trim() });
      onClose();
    };
    const buildSummary = () => {
      const d = new Date();
      const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      const L = [];
      L.push(`📌 $${(f.ticker || '').toUpperCase()} — Watchlist (${dateStr})`);
      L.push('');
      if (f.currentPrice != null) L.push(`ราคา: $${T.fmtNum(f.currentPrice, 2)}${f.pctToday != null ? `  (${f.pctToday >= 0 ? '+' : ''}${f.pctToday.toFixed(2)}% วันนี้)` : ''}`);
      if (f.target != null)  L.push(`Target เข้า: ≤ $${T.fmtNum(f.target, 2)}`);
      if (f.stop != null)    L.push(`Stop: ≤ $${T.fmtNum(f.stop, 2)}`);
      if (f.note && f.note.trim()) { L.push(''); L.push(`📝 ${f.note.trim()}`); }
      L.push('');
      L.push('#Fillbook #watchlist');
      return L.join('\n');
    };
    const copySummary = () => {
      const txt = buildSummary();
      setPreview(txt);
      setCopied(false);
      if (navigator.clipboard && window.isSecureContext)
        navigator.clipboard.writeText(txt).then(() => setCopied(true)).catch(() => {});
    };
    const copyFromPreview = () => {
      const txt = preview || '';
      const done = () => { setCopied(true); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(txt).then(done).catch(() => {
          if (taRef.current) { taRef.current.focus(); taRef.current.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
        });
      } else if (taRef.current) {
        taRef.current.focus(); taRef.current.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    };
    const shareX = () => {
      window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(buildSummary()), '_blank');
    };
    const up = f.pctToday != null && f.pctToday >= 0;
    return (
      <div>
        <div className="form-grid">
          <Field label="Ticker" span>
            <input className="input" style={{ textTransform: 'uppercase' }} value={f.ticker} placeholder="เช่น NVDA" onChange={e => set('ticker', e.target.value)} />
          </Field>
          <Field label="ราคาปัจจุบัน" hint="อัตโนมัติเมื่อเชื่อม API">
            <input className="input num" type="number" step="any" value={f.currentPrice ?? ''} onChange={num('currentPrice')} placeholder="—" />
          </Field>
          <Field label="% วันนี้" hint="อัตโนมัติ">
            <input className="input num" type="number" step="any" value={f.pctToday ?? ''} onChange={num('pctToday')} placeholder="—" />
          </Field>
          <Field label="Target — แจ้งเตือนเมื่อราคา ≤" hint="ราคาที่อยากเข้า">
            <input className="input num" type="number" step="any" value={f.target ?? ''} onChange={num('target')} placeholder="—" />
          </Field>
          <Field label="Stop — แจ้งเตือนเมื่อราคา ≤" hint="ราคาที่อยากออก">
            <input className="input num" type="number" step="any" value={f.stop ?? ''} onChange={num('stop')} placeholder="—" />
          </Field>
          <Field label="โน้ต / เหตุผลที่จับตา" span>
            <textarea className="input" rows={3} value={f.note} placeholder="เช่น รอ entry รอบ $180 หลังงบ / ใส่เกณฑ์ของคุณเองได้เลย" onChange={e => set('note', e.target.value)} />
          </Field>
        </div>

        {/* live snapshot */}
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>สถานะปัจจุบัน</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="tkr" style={{ fontSize: 16 }}>{f.ticker ? f.ticker.toUpperCase() : '—'}</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{f.currentPrice != null ? T.fmtMoney(f.currentPrice, 2) : '—'}</span>
            {f.pctToday != null && <span className="num" style={{ fontSize: 13, fontWeight: 600, color: up ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{up ? '▲' : '▼'} {Math.abs(f.pctToday).toFixed(2)}%</span>}
          </div>
          {(f.target != null || f.stop != null) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
              {f.target != null && <span className="faint">Target <span className="num" style={{ color: 'var(--text)' }}>{T.fmtNum(f.target, 2)}</span></span>}
              {f.stop != null && <span className="faint">Stop <span className="num" style={{ color: 'var(--text)' }}>{T.fmtNum(f.stop, 2)}</span></span>}
            </div>
          )}
        </div>

        {/* copy / share */}
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>บันทึก / แชร์</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ flex: 1 }} onClick={copySummary}>
              <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied!' : 'Copy สรุป'}
            </button>
            <button className="btn btn-sm" style={{ flex: 1 }} onClick={shareX}>
              <Icon name="xtwitter" size={15} />แชร์ X
            </button>
          </div>
          <div className="faint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>สรุปราคา · target · stop · โน้ต พร้อมวันที่ — ไว้โพสต์/เก็บเป็นบันทึก</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}><Icon name="check" size={16} />บันทึก</button>
          {initial && initial !== 'new' && (
            <button className="btn btn-ghost" style={{ color: 'var(--neg-bright)' }} onClick={() => { onDelete(initial.id); onClose(); }}><Icon name="trash" size={15} />ลบ</button>
          )}
        </div>

        {preview != null && (
          <>
            <div className="scrim" style={{ zIndex: 130 }} onClick={() => setPreview(null)} />
            <div className="copy-modal" role="dialog" aria-label="ตัวอย่างข้อความ">
              <div className="copy-modal-head">
                <div style={{ fontWeight: 600, fontSize: 15 }}>ตัวอย่างข้อความ <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>· แบบที่จะนำไปวาง</span></div>
                <button className="btn btn-ghost icon-btn" onClick={() => setPreview(null)}><Icon name="close" /></button>
              </div>
              <textarea ref={taRef} className="copy-ta" readOnly value={preview} onFocus={e => e.target.select()} />
              <div className="copy-modal-foot">
                <span className="faint" style={{ fontSize: 11.5, flex: 1 }}>{copied ? 'คัดลอกแล้ว — วางได้เลย' : 'กด Copy หรือเลือกข้อความเองก็ได้'}</span>
                <button className="btn" onClick={() => setPreview(null)}>ปิด</button>
                <button className="btn btn-primary" onClick={copyFromPreview}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'คัดลอกแล้ว' : 'Copy'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- card -----------------------------------------------------------
  function WatchCard({ w, onEdit }) {
    const pa = priceAlerts(w);
    const up = w.pctToday != null && w.pctToday >= 0;
    const hasAlert = pa.length > 0;
    const accent = hasAlert ? (pa.some(a => a.kind === 'stop') ? 'var(--neg-bright)' : 'var(--accent-2)') : 'var(--border)';
    return (
      <div className="card row-click wl-card" onClick={() => onEdit(w)}
        style={{ padding: 0, overflow: 'hidden', position: 'relative', borderLeft: `3px solid ${accent}`, cursor: 'pointer' }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <span className="tkr" style={{ fontSize: 16 }}>{w.ticker}</span>
            {w.currentPrice != null && <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{T.fmtMoney(w.currentPrice, 2)}</span>}
            {w.pctToday != null && (
              <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: up ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>
                {up ? '▲' : '▼'} {Math.abs(w.pctToday).toFixed(2)}%
              </span>
            )}
          </div>

          {(w.target != null || w.stop != null) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
              {w.target != null && <span className="faint">Target <span className="num" style={{ color: 'var(--text)' }}>{T.fmtNum(w.target, 2)}</span></span>}
              {w.stop != null && <span className="faint">Stop <span className="num" style={{ color: 'var(--text)' }}>{T.fmtNum(w.stop, 2)}</span></span>}
            </div>
          )}

          {w.note && <div className="faint" style={{ fontSize: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-soft)', lineHeight: 1.5 }}>{w.note}</div>}

          {pa.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {pa.map((a, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: a.kind === 'stop' ? 'rgba(229,72,77,.14)' : 'var(--accent-soft)',
                  color: a.kind === 'stop' ? 'var(--neg-bright)' : 'var(--accent-2)' }}>{a.text}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function WatchRow({ w, onEdit }) {
    const up = w.pctToday != null && w.pctToday >= 0;
    return (
      <div className="wl-row row-click" onClick={() => onEdit(w)}>
        <span className="tkr" style={{ fontSize: 13.5, minWidth: 56 }}>{w.ticker}</span>
        <span className="num" style={{ fontSize: 13, fontWeight: 600, minWidth: 64 }}>{w.currentPrice != null ? T.fmtMoney(w.currentPrice, 2) : '—'}</span>
        <span className="num" style={{ fontSize: 11.5, fontWeight: 600, minWidth: 56, color: w.pctToday == null ? 'var(--text-faint)' : (up ? 'var(--pos-bright)' : 'var(--neg-bright)') }}>
          {w.pctToday != null ? (up ? '▲' : '▼') + ' ' + Math.abs(w.pctToday).toFixed(2) + '%' : '—'}
        </span>
        <span className="wl-row-metrics">
          {w.target != null && <span style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}><span className="faint" style={{ fontSize: 10 }}>Target </span><span className="num" style={{ fontWeight: 600 }}>{T.fmtNum(w.target, 2)}</span></span>}
          {w.stop != null && <span style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}><span className="faint" style={{ fontSize: 10 }}>Stop </span><span className="num" style={{ fontWeight: 600 }}>{T.fmtNum(w.stop, 2)}</span></span>}
        </span>
        <span className="faint wl-row-status" style={{ fontSize: 11.5, marginLeft: 'auto', textAlign: 'right', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.note || ''}</span>
      </div>
    );
  }

  // ---- page -----------------------------------------------------------
  function WatchlistPage() {
    const list = window.useWatchlist();
    const settings = window.useSettings();
    const tdKey = settings.tdKey || '';
    const [editing, setEditing] = useState(null);
    const [q, setQ] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [refreshErr, setRefreshErr] = useState('');
    const [progress, setProgress] = useState(null);
    const [keyOpen, setKeyOpen] = useState(false);
    const [keyInput, setKeyInput] = useState(tdKey);
    useEffect(() => { setKeyInput(tdKey); }, [tdKey]);

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    const refreshPrices = async () => {
      if (!list.length) return;
      if (!tdKey) { setKeyOpen(true); return; }
      setRefreshing(true); setRefreshErr(''); setProgress({ done: 0, total: list.length, errs: [] });
      const errs = [];
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        try {
          const upd = await fetchTD(w.ticker, tdKey);
          window.Store.updateWatch(w.id, upd);
        } catch (e) { errs.push(w.ticker + ': ' + (e.message || 'error')); }
        setProgress({ done: i + 1, total: list.length, errs });
        if (i < list.length - 1) await wait(8000);
      }
      if (errs.length) setRefreshErr(errs.length + ' ตัวโหลดไม่สำเร็จ (เช็ค ticker / rate limit)');
      setRefreshing(false);
      setTimeout(() => setProgress(null), 2500);
    };

    const rows = useMemo(() => {
      let r = list.slice();
      if (q.trim()) { const s = q.toLowerCase(); r = r.filter(w => (w.ticker || '').toLowerCase().includes(s) || (w.note || '').toLowerCase().includes(s)); }
      // items with a fired alert first, then by ticker
      return r.sort((a, b) => {
        const aa = priceAlerts(a).length ? 1 : 0;
        const bb = priceAlerts(b).length ? 1 : 0;
        if (bb !== aa) return bb - aa;
        return (a.ticker || '').localeCompare(b.ticker || '');
      });
    }, [list, q]);

    const entryZone = list.filter(w => priceAlerts(w).some(a => a.kind === 'target'));
    const stopHit = list.filter(w => priceAlerts(w).some(a => a.kind === 'stop'));
    const bigMove = list.filter(w => priceAlerts(w).some(a => a.kind === 'move'));

    return (
      <div className="content">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 18 }}>
          {window.KPI({ label: 'กำลังจับตา', icon: 'eye', value: list.length, sub: <span className="faint">{[...new Set(list.map(w => w.ticker))].length} tickers</span> })}
          {window.KPI({ label: 'ถึงโซน Entry', icon: 'target', accent: true, value: entryZone.length, sub: <span className="faint">≤ target</span> })}
          {window.KPI({ label: 'หลุด Stop', icon: 'pulse', value: stopHit.length, sub: <span className="faint">≤ stop</span> })}
          {window.KPI({ label: 'เคลื่อนไหวแรง', icon: 'flame', value: bigMove.length, sub: <span className="faint">{'±5% วันนี้'}</span> })}
        </div>

        <Card pad={false} style={{ marginBottom: 18 }}>
          <div className="card-pad" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
              <Icon name="search" size={16} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-faint)' }} />
              <input className="input" style={{ paddingLeft: 34 }} placeholder="ค้นหา ticker หรือโน้ต…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="btn btn-sm" onClick={refreshPrices} disabled={refreshing} style={refreshing ? { opacity: .6 } : null}>
              <Icon name="reset" size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : null} />
              {refreshing && progress ? `กำลังดึง ${progress.done}/${progress.total}…` : '🔄 อัปเดตราคา'}
            </button>
            <button className={'btn btn-sm' + (tdKey ? '' : ' btn-primary')} onClick={() => setKeyOpen(o => !o)} title="ตั้งค่า API">
              <Icon name="pulse" size={14} />{tdKey ? 'API ✓' : 'เชื่อม API'}
            </button>
            {refreshErr && <span className="faint" style={{ fontSize: 12, color: 'var(--neg-bright)' }}>{refreshErr}</span>}
            <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Icon name="plus" size={14} />เพิ่มหุ้นจับตา</button>
          </div>
          {keyOpen && (
            <div className="card-pad" style={{ borderTop: '1px solid var(--border-soft)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Twelve Data API Key <span className="faint" style={{ fontWeight: 400 }}>— ดึงราคาอัตโนมัติ</span></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '1 1 240px', fontFamily: 'var(--font-mono)', fontSize: 13 }} placeholder="วาง API key ที่นี่…" value={keyInput} onChange={e => setKeyInput(e.target.value.trim())} />
                <button className="btn btn-primary" onClick={() => { window.Store.setSettings({ tdKey: keyInput.trim() }); setKeyOpen(false); }}><Icon name="check" size={15} />บันทึก</button>
              </div>
              <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>ขอ key ฟรีได้ที่ <span style={{ color: 'var(--accent-2)' }}>twelvedata.com</span> (ไม่ต้องใส่บัตร) · ฟรี 800 ครั้ง/วัน · ระบบดึงทีละตัว (ห่าง 8 วิ) เพื่อไม่ชน rate limit</div>
            </div>
          )}
        </Card>

        {rows.length ? (() => {
          const cardRows = rows.filter(w => priceAlerts(w).length > 0);
          const restRows = rows.filter(w => priceAlerts(w).length === 0);
          return (
            <React.Fragment>
              {cardRows.length > 0 && (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 14, alignItems: 'start' }}>
                  {cardRows.map(w => <WatchCard key={w.id} w={w} onEdit={setEditing} />)}
                </div>
              )}
              {restRows.length > 0 && (
                <Card pad={false} style={{ marginTop: cardRows.length ? 18 : 0 }}>
                  <div className="card-pad" style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-soft)' }}>
                    <Icon name="eye" size={15} style={{ color: 'var(--text-faint)' }} />
                    <div className="card-title" style={{ fontSize: 13.5 }}>กำลังจับตา <span className="th">· {restRows.length} ตัว</span></div>
                  </div>
                  <div>
                    {restRows.map(w => <WatchRow key={w.id} w={w} onEdit={setEditing} />)}
                  </div>
                </Card>
              )}
            </React.Fragment>
          );
        })() : (
          <Card><div className="empty" style={{ padding: '40px 20px' }}>
            <Icon name="eye" size={28} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
            <div>ยังไม่มีหุ้นในลิสต์จับตา</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>กด “เพิ่มหุ้นจับตา” ใส่ ticker + ราคา target/stop ที่คุณอยากให้เตือน → เชื่อม API แล้วกด “อัปเดตราคา” ระบบดึงราคาให้เอง</div>
          </div></Card>
        )}

        <Drawer open={!!editing} onClose={() => setEditing(null)}
          title={editing === 'new' ? 'เพิ่มหุ้นจับตา' : (editing && editing.ticker)}
          sub={editing === 'new' ? 'ใส่ ticker + ราคาที่อยากให้แจ้งเตือน' : 'แก้ไขรายการจับตา'}>
          {editing && <WatchForm initial={editing} onSave={(w) => { if (editing === 'new') window.Store.addWatch(w); else window.Store.updateWatch(editing.id, w); }}
            onDelete={(id) => window.Store.deleteWatch(id)} onClose={() => setEditing(null)} />}
        </Drawer>
      </div>
    );
  }

  window.WatchlistPage = WatchlistPage;
})();
