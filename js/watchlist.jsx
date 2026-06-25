/* ============================================================
   watchlist.jsx — watchlist with an OPTIONAL signal grader.
   Two modes, controlled by Store settings.signalMode:
     • OFF (default, sellable): neutral price watchlist — price +
       % today + user-set entry/stop alerts + notes. No verdict.
     • ON  (opt-in): full BB-lower / EMA200 / RSI engine that
       auto-fetches indicators and grades A+/A/B+/B (same logic
       as the original OptionNLog build).
   grade() reads the live setting, so the sidebar badge / alert
   toast (window.WL) behave correctly in both modes with no
   changes needed in app.jsx.
   ============================================================ */
(function () {
  const { useState, useMemo, useEffect, useRef } = React;
  const { Icon, Card, Drawer, Field } = window;
  const T = window.TL;

  const sigOn = () => { try { return !!(window.Store.getSettings().signalMode); } catch (e) { return false; } };

  // ---- indicator math (computed locally from daily closes) -----------
  function sma(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
  function stdev(arr) { const m = sma(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length); }
  function ema(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let e = sma(closes.slice(0, period));
    for (let i = period; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
    return e;
  }
  function rsi(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) gain += d; else loss -= d; }
    let ag = gain / period, al = loss / period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
      al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (al === 0) return 100;
    const rs = ag / al;
    return 100 - 100 / (1 + rs);
  }
  function indicatorsFromCloses(closes) {
    const last20 = closes.slice(-20);
    const mid = last20.length === 20 ? sma(last20) : null;
    const sd = last20.length === 20 ? stdev(last20) : null;
    return {
      bbLower: (mid != null && sd != null) ? +(mid - 2 * sd).toFixed(2) : null,
      ema200: ema(closes, 200) != null ? +ema(closes, 200).toFixed(2) : null,
      rsi: rsi(closes, 14) != null ? +rsi(closes, 14).toFixed(1) : null,
    };
  }
  // fetch from Twelve Data. full=true → 250 bars + indicators; else 2 bars (price + % only)
  async function fetchTD(ticker, key, full) {
    const size = full ? 250 : 2;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=${size}&apikey=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d || d.status === 'error' || !Array.isArray(d.values) || !d.values.length) {
      throw new Error(d && d.message ? d.message : 'no data');
    }
    if (full) {
      // newest→oldest; reverse to oldest→newest for indicators
      const closes = d.values.map(v => parseFloat(v.close)).reverse();
      const price = closes[closes.length - 1];
      const prev = closes.length > 1 ? closes[closes.length - 2] : price;
      const ind = indicatorsFromCloses(closes);
      return { currentPrice: +price.toFixed(2), pctToday: prev ? +(((price - prev) / prev) * 100).toFixed(2) : null, ...ind };
    }
    const closes = d.values.map(v => parseFloat(v.close)); // newest→oldest
    const price = closes[0];
    const prev = closes.length > 1 ? closes[1] : price;
    return { currentPrice: +price.toFixed(2), pctToday: prev ? +(((price - prev) / prev) * 100).toFixed(2) : null };
  }

  // ---- grading engine (only active when signalMode on) ----------------
  const GRADES = {
    'A+': { color: '#1f9d62', glow: 'rgba(31,157,98,.5)',  rank: 4, desc: 'แตะ BB ล่าง · เหนือ EMA200 · RSI < 30 (oversold)' },
    'A':  { color: '#37c684', glow: 'rgba(55,198,132,.45)', rank: 3, desc: 'แตะ BB ล่าง · เหนือ EMA200' },
    'B+': { color: '#d8a229', glow: 'rgba(216,162,41,.45)', rank: 2, desc: 'แตะ BB ล่าง · ใต้ EMA200 · RSI < 30 (oversold)' },
    'B':  { color: '#6aa6ff', glow: 'rgba(106,166,255,.4)', rank: 1, desc: 'แตะ BB ล่าง · ใต้ EMA200' },
  };

  // ---- custom screener: up to 3 user-defined conditions ----
  // (the whole Watchlist page is already owner-gated in app.jsx → no extra gate needed)
  const SCR_METRICS = {
    price:    { label: 'ราคา',    get: w => w.currentPrice },
    bbLower:  { label: 'BB ล่าง', get: w => w.bbLower },
    ema200:   { label: 'EMA200',  get: w => w.ema200 },
    rsi:      { label: 'RSI',     get: w => w.rsi },
    pctToday: { label: '%วันนี้', get: w => w.pctToday },
    ivr:      { label: 'IVR',     get: w => w.ivr },
  };
  const SCR_MKEYS = Object.keys(SCR_METRICS);
  const SCR_OPS = { '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '>': (a, b) => a > b };
  function scrConds() { try { const c = window.Store.getSettings().screenerConditions; return Array.isArray(c) ? c.filter(x => x && x.metric && x.op) : []; } catch (e) { return []; } }
  function screenerOn() { return scrConds().length > 0; }
  function evalCond(w, c) {
    const lhs = SCR_METRICS[c.metric] ? SCR_METRICS[c.metric].get(w) : null;
    const rhs = c.rhsMetric ? (SCR_METRICS[c.rhsMetric] ? SCR_METRICS[c.rhsMetric].get(w) : null) : c.value;
    if (lhs == null || rhs == null || isNaN(lhs) || isNaN(rhs)) return false;
    const fn = SCR_OPS[c.op]; return fn ? fn(+lhs, +rhs) : false;
  }
  function evalScreener(w) { const cs = scrConds(); let met = 0; cs.forEach(c => { if (evalCond(w, c)) met++; }); return { met, total: cs.length, ok: cs.length > 0 && met === cs.length }; }
  function condText(c) { const m = SCR_METRICS[c.metric] ? SCR_METRICS[c.metric].label : c.metric; const r = c.rhsMetric ? (SCR_METRICS[c.rhsMetric] ? SCR_METRICS[c.rhsMetric].label : c.rhsMetric) : c.value; return m + ' ' + c.op + ' ' + r; }

  function grade(w) {
    if (!sigOn()) return { g: null, label: '', sub: '', active: false };
    if (screenerOn()) {
      const s = evalScreener(w);
      return { g: null, custom: s, active: s.ok, met: s.met, total: s.total, waiting: !s.ok,
        label: s.ok ? `เข้าครบ ${s.met}/${s.total}` : `เข้า ${s.met}/${s.total} ข้อ`,
        sub: scrConds().map(condText).join(' · ') };
    }
    const price = w.currentPrice;
    const { bbLower, ema200, rsi } = w;
    const atBBLower   = price != null && bbLower != null && price <= bbLower;
    const aboveEMA200 = price != null && ema200 != null && price >= ema200;
    const oversold    = rsi != null && rsi < 30;

    if (price == null) return { g: null, label: 'ยังไม่มีราคา', sub: 'กดอัปเดตราคา', active: false };
    if (bbLower == null || ema200 == null)
      return { g: null, label: 'ยังไม่มีข้อมูล', sub: 'กดดึงข้อมูลจาก API', active: false, setup: true };
    if (!atBBLower) {
      const dist = ((price - bbLower) / bbLower) * 100;
      return { g: null, label: 'รอราคาลงแตะ BB ล่าง', sub: `ยังเหนือ BB ล่าง ${dist.toFixed(1)}% (${T.fmtNum(bbLower, 2)})`, active: false, waiting: true };
    }
    let g;
    if (aboveEMA200 && oversold)        g = 'A+';
    else if (aboveEMA200 && !oversold)  g = 'A';
    else if (!aboveEMA200 && oversold)  g = 'B+';
    else                                g = 'B';
    return { g, label: 'สัญญาณ ' + g, sub: GRADES[g].desc, active: true };
  }

  // price alerts the USER defines: entry zone, stop, big move (both modes)
  function priceAlerts(w) {
    const a = [];
    const p = w.currentPrice;
    if (p != null && w.target != null && p <= w.target) a.push({ kind: 'target', text: `ถึงโซน entry ≤ ${T.fmtNum(w.target, 2)}` });
    if (p != null && w.stop != null && p <= w.stop)     a.push({ kind: 'stop',   text: `หลุด stop ≤ ${T.fmtNum(w.stop, 2)}` });
    if (w.pctToday != null && Math.abs(w.pctToday) >= 5) a.push({ kind: 'move', text: `${w.pctToday > 0 ? '+' : ''}${w.pctToday.toFixed(1)}% วันนี้` });
    return a;
  }

  window.WL = { grade, priceAlerts, GRADES };

  // ---- form -----------------------------------------------------------
  const blank = { ticker: '', note: '', target: null, stop: null, bbLower: null, ema200: null, rsi: null, ivr: null, currentPrice: null, pctToday: null };

  function WatchForm({ initial, onSave, onDelete, onClose, signalMode }) {
    const [f, setF] = useState(() => ({ ...blank, ...(initial && initial !== 'new' ? initial : {}) }));
    const [copied, setCopied] = useState(false);
    const [preview, setPreview] = useState(null);
    const taRef = useRef(null);
    const set = (k, v) => setF(s => ({ ...s, [k]: v }));
    const num = (k) => (e) => { const v = e.target.value; set(k, v === '' ? null : parseFloat(v)); };
    const g = grade(f);
    const up = f.pctToday != null && f.pctToday >= 0;
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
      if (signalMode && g.g) L.push(`สัญญาณ: ${g.g} — ${g.sub}`);
      L.push('');
      if (f.currentPrice != null) L.push(`ราคา: $${T.fmtNum(f.currentPrice, 2)}${f.pctToday != null ? `  (${f.pctToday >= 0 ? '+' : ''}${f.pctToday.toFixed(2)}% วันนี้)` : ''}`);
      if (signalMode) {
        if (f.bbLower != null) L.push(`BB ล่าง: $${T.fmtNum(f.bbLower, 2)}`);
        if (f.ema200 != null)  L.push(`EMA200: $${T.fmtNum(f.ema200, 2)}${f.currentPrice != null ? (f.currentPrice >= f.ema200 ? ' (เหนือ)' : ' (ใต้)') : ''}`);
        if (f.rsi != null)     L.push(`RSI: ${f.rsi.toFixed(1)}${f.rsi < 30 ? ' (oversold)' : f.rsi > 70 ? ' (overbought)' : ''}`);
        if (f.ivr != null)     L.push(`IVR: ${f.ivr.toFixed(0)}%`);
      }
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
    return (
      <div>
        <div className="form-grid">
          <Field label="Ticker" span>
            <input className="input" style={{ textTransform: 'uppercase' }} value={f.ticker} placeholder="เช่น NVDA" onChange={e => set('ticker', e.target.value)} />
          </Field>
          {signalMode && (
            <>
              <Field label="BB ล่าง (Bollinger Lower)" hint="อัตโนมัติเมื่อเชื่อม API">
                <input className="input num" type="number" step="any" value={f.bbLower ?? ''} onChange={num('bbLower')} placeholder="—" />
              </Field>
              <Field label="EMA 200" hint="อัตโนมัติเมื่อเชื่อม API">
                <input className="input num" type="number" step="any" value={f.ema200 ?? ''} onChange={num('ema200')} placeholder="—" />
              </Field>
              <Field label="RSI (14)" hint="< 30 oversold · อัตโนมัติ">
                <input className="input num" type="number" step="any" value={f.rsi ?? ''} onChange={num('rsi')} placeholder="—" />
              </Field>
            </>
          )}
          <Field label="ราคาปัจจุบัน" hint="อัตโนมัติเมื่อเชื่อม API">
            <input className="input num" type="number" step="any" value={f.currentPrice ?? ''} onChange={num('currentPrice')} placeholder="—" />
          </Field>
          {signalMode && (
            <Field label="IVR — IV Rank (%)" hint="กรอกเองจาก IBKR · ไว้บันทึกตอนตัดสินใจ">
              <input className="input num" type="number" step="any" value={f.ivr ?? ''} onChange={num('ivr')} placeholder="—" />
            </Field>
          )}
          {!signalMode && (
            <Field label="% วันนี้" hint="อัตโนมัติ">
              <input className="input num" type="number" step="any" value={f.pctToday ?? ''} onChange={num('pctToday')} placeholder="—" />
            </Field>
          )}
          <Field label="Target (อยากเข้า ≤)">
            <input className="input num" type="number" step="any" value={f.target ?? ''} onChange={num('target')} placeholder="—" />
          </Field>
          <Field label="Stop (อยากออก ≤)">
            <input className="input num" type="number" step="any" value={f.stop ?? ''} onChange={num('stop')} placeholder="—" />
          </Field>
          <Field label="โน้ต / เหตุผลที่จับตา" span>
            <textarea className="input" rows={2} value={f.note} placeholder="เช่น รอ entry รอบ $180 หลังงบ" onChange={e => set('note', e.target.value)} />
          </Field>
        </div>

        {/* live preview */}
        {signalMode ? (
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>สัญญาณที่จะได้</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <GradeBadge g={g.g} size="lg" custom={g.custom} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{g.label}</div>
                <div className="faint" style={{ fontSize: 12 }}>{g.sub}</div>
              </div>
            </div>
          </div>
        ) : (
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
        )}

        {/* summary / share */}
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
          <div className="faint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>{signalMode ? 'สรุปราคา · BB · EMA · RSI · IVR · สัญญาณ พร้อมวันที่' : 'สรุปราคา · target · stop · โน้ต พร้อมวันที่'} — ไว้โพสต์/เก็บเป็นบันทึก</div>
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

  function GradeBadge({ g, size, custom }) {
    const big = size === 'lg';
    if (custom) {
      const ok = custom.ok;
      const col = ok ? '#37c684' : (custom.met > 0 ? '#d8a229' : 'var(--text-faint)');
      return (
        <span style={{ display: 'inline-grid', placeItems: 'center', width: big ? 52 : 34, height: big ? 52 : 34, borderRadius: big ? 14 : 9,
          background: ok ? col : 'var(--surface-3, rgba(255,255,255,.04))', color: ok ? '#0a0e14' : col,
          border: ok ? 'none' : '1px dashed var(--border)', fontWeight: 800, fontSize: big ? 17 : 12, flexShrink: 0,
          boxShadow: ok ? `0 0 0 1px ${col}, 0 4px 16px -4px rgba(55,198,132,.45)` : 'none' }}>{custom.met}/{custom.total}</span>
      );
    }
    if (!g) return (
      <span style={{ display: 'inline-grid', placeItems: 'center', width: big ? 52 : 34, height: big ? 52 : 34, borderRadius: big ? 14 : 9,
        background: 'var(--surface-3, rgba(255,255,255,.04))', border: '1px dashed var(--border)', color: 'var(--text-faint)', fontWeight: 700, fontSize: big ? 20 : 13, flexShrink: 0 }}>–</span>
    );
    const c = GRADES[g];
    return (
      <span style={{ display: 'inline-grid', placeItems: 'center', width: big ? 52 : 34, height: big ? 52 : 34, borderRadius: big ? 14 : 9,
        background: c.color, color: '#0a0e14', fontWeight: 800, fontSize: big ? 22 : 14, flexShrink: 0,
        boxShadow: `0 0 0 1px ${c.color}, 0 4px 16px -4px ${c.glow}` }}>{g}</span>
    );
  }

  function Metric({ label, value, sub, subColor, hit }) {
    return (
      <div style={{ background: hit ? 'var(--accent-soft)' : 'var(--surface-2)', borderRadius: 9, padding: '7px 9px', border: hit ? '1px solid var(--accent-line)' : '1px solid transparent' }}>
        <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
        <div className="num" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
        {sub && <div className="num" style={{ fontSize: 10.5, fontWeight: 600, color: subColor || 'var(--text-faint)' }}>{sub}</div>}
      </div>
    );
  }

  // ---- card -----------------------------------------------------------
  function WatchCard({ w, onEdit, signalMode }) {
    const g = grade(w);
    const pa = priceAlerts(w);
    const up = w.pctToday != null && w.pctToday >= 0;
    const accent = signalMode
      ? (g.custom ? (g.custom.ok ? '#37c684' : 'var(--border)') : (g.g ? GRADES[g.g].color : 'var(--border)'))
      : (pa.length ? (pa.some(a => a.kind === 'stop') ? 'var(--neg-bright)' : 'var(--accent-2)') : 'var(--border)');
    return (
      <div className="card row-click wl-card" onClick={() => onEdit(w)}
        style={{ padding: 0, overflow: 'hidden', position: 'relative', borderLeft: `3px solid ${accent}`, cursor: 'pointer' }}>
        <div style={{ padding: '14px 16px' }}>
          {signalMode ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <GradeBadge g={g.g} size="lg" custom={g.custom} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span className="tkr" style={{ fontSize: 16 }}>{w.ticker}</span>
                  {w.currentPrice != null && <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{T.fmtMoney(w.currentPrice, 2)}</span>}
                  {w.pctToday != null && (
                    <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: up ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>
                      {up ? '▲' : '▼'} {Math.abs(w.pctToday).toFixed(2)}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: g.active ? accent : 'var(--text-faint)', fontWeight: g.active ? 600 : 400, marginTop: 3 }}>{g.label}</div>
                <div className="faint" style={{ fontSize: 11.5, marginTop: 1 }}>{g.sub}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span className="tkr" style={{ fontSize: 16 }}>{w.ticker}</span>
              {w.currentPrice != null && <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{T.fmtMoney(w.currentPrice, 2)}</span>}
              {w.pctToday != null && (
                <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: up ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>
                  {up ? '▲' : '▼'} {Math.abs(w.pctToday).toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {signalMode && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
              <Metric label="BB ล่าง" value={w.bbLower != null ? T.fmtNum(w.bbLower, 2) : '—'} hit={w.currentPrice != null && w.bbLower != null && w.currentPrice <= w.bbLower} />
              <Metric label="EMA200" value={w.ema200 != null ? T.fmtNum(w.ema200, 2) : '—'}
                sub={w.currentPrice != null && w.ema200 != null ? (w.currentPrice >= w.ema200 ? 'เหนือ' : 'ใต้') : null}
                subColor={w.currentPrice != null && w.ema200 != null ? (w.currentPrice >= w.ema200 ? 'var(--pos-bright)' : 'var(--neg-bright)') : null} />
              <Metric label="RSI" value={w.rsi != null ? w.rsi.toFixed(0) : '—'}
                sub={w.rsi != null ? (w.rsi < 30 ? 'oversold' : w.rsi > 70 ? 'overbought' : null) : null}
                subColor={w.rsi != null ? (w.rsi < 30 ? 'var(--pos-bright)' : w.rsi > 70 ? 'var(--neg-bright)' : null) : null}
                hit={w.rsi != null && w.rsi < 30} />
            </div>
          )}

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

  function WatchRow({ w, onEdit, signalMode }) {
    const g = grade(w);
    const up = w.pctToday != null && w.pctToday >= 0;
    const mini = (label, value, color) => (
      <span style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
        <span className="faint" style={{ fontSize: 10 }}>{label} </span>
        <span className="num" style={{ color: color || 'var(--text-dim)', fontWeight: 600 }}>{value}</span>
      </span>
    );
    return (
      <div className="wl-row row-click" onClick={() => onEdit(w)}>
        <span className="tkr" style={{ fontSize: 13.5, minWidth: 56 }}>{w.ticker}</span>
        <span className="num" style={{ fontSize: 13, fontWeight: 600, minWidth: 64 }}>{w.currentPrice != null ? T.fmtMoney(w.currentPrice, 2) : '—'}</span>
        <span className="num" style={{ fontSize: 11.5, fontWeight: 600, minWidth: 56, color: w.pctToday == null ? 'var(--text-faint)' : (up ? 'var(--pos-bright)' : 'var(--neg-bright)') }}>
          {w.pctToday != null ? (up ? '▲' : '▼') + ' ' + Math.abs(w.pctToday).toFixed(2) + '%' : '—'}
        </span>
        <span className="wl-row-metrics">
          {signalMode ? (
            <>
              {mini('BB', w.bbLower != null ? T.fmtNum(w.bbLower, 2) : '—', w.currentPrice != null && w.bbLower != null && w.currentPrice <= w.bbLower ? 'var(--accent-2)' : null)}
              {mini('EMA200', w.ema200 != null ? T.fmtNum(w.ema200, 2) : '—', w.currentPrice != null && w.ema200 != null ? (w.currentPrice >= w.ema200 ? 'var(--pos-bright)' : 'var(--neg-bright)') : null)}
              {mini('RSI', w.rsi != null ? w.rsi.toFixed(0) : '—', w.rsi != null && w.rsi < 30 ? 'var(--pos-bright)' : null)}
            </>
          ) : (
            <>
              {w.target != null && mini('Target', T.fmtNum(w.target, 2))}
              {w.stop != null && mini('Stop', T.fmtNum(w.stop, 2))}
            </>
          )}
        </span>
        <span className="faint wl-row-status" style={{ fontSize: 11.5, marginLeft: 'auto', textAlign: 'right', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signalMode ? (g.sub || g.label) : (w.note || '')}</span>
      </div>
    );
  }

  // ---- page -----------------------------------------------------------
  function WatchlistPage() {
    const list = window.useWatchlist();
    const settings = window.useSettings();
    const signalMode = !!settings.signalMode;
    const tdKey = settings.tdKey || '';
    const [editing, setEditing] = useState(null);
    const [q, setQ] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [refreshErr, setRefreshErr] = useState('');
    const [progress, setProgress] = useState(null);
    const [keyOpen, setKeyOpen] = useState(false);
    const [keyInput, setKeyInput] = useState(tdKey);
    useEffect(() => { setKeyInput(tdKey); }, [tdKey]);
    const [scrOpen, setScrOpen] = useState(false);

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    const refreshPrices = async () => {
      if (!list.length) return;
      if (!tdKey) { setKeyOpen(true); return; }
      setRefreshing(true); setRefreshErr(''); setProgress({ done: 0, total: list.length, errs: [] });
      const errs = [];
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        try {
          const upd = await fetchTD(w.ticker, tdKey, signalMode);
          window.Store.updateWatch(w.id, upd);
        } catch (e) { errs.push(w.ticker + ': ' + (e.message || 'error')); }
        setProgress({ done: i + 1, total: list.length, errs });
        if (i < list.length - 1) await wait(8000); // ≤ 8 calls/min free tier
      }
      if (errs.length) setRefreshErr(errs.length + ' ตัวโหลดไม่สำเร็จ (เช็ค ticker / rate limit)');
      setRefreshing(false);
      setTimeout(() => setProgress(null), 2500);
    };

    const rows = useMemo(() => {
      let r = list.slice();
      if (q.trim()) { const s = q.toLowerCase(); r = r.filter(w => (w.ticker || '').toLowerCase().includes(s) || (w.note || '').toLowerCase().includes(s)); }
      if (signalMode) {
        return r.sort((a, b) => {
          const ga = grade(a), gb = grade(b);
          const ra = ga.custom ? (ga.custom.ok ? 5 : ga.met) : (ga.g ? GRADES[ga.g].rank : (ga.waiting ? 0.5 : 0));
          const rb = gb.custom ? (gb.custom.ok ? 5 : gb.met) : (gb.g ? GRADES[gb.g].rank : (gb.waiting ? 0.5 : 0));
          if (rb !== ra) return rb - ra;
          return (a.ticker || '').localeCompare(b.ticker || '');
        });
      }
      return r.sort((a, b) => {
        const aa = priceAlerts(a).length ? 1 : 0;
        const bb = priceAlerts(b).length ? 1 : 0;
        if (bb !== aa) return bb - aa;
        return (a.ticker || '').localeCompare(b.ticker || '');
      });
    }, [list, q, signalMode]);

    const active = list.filter(w => grade(w).active);
    const entryZone = list.filter(w => priceAlerts(w).some(a => a.kind === 'target'));
    const stopHit = list.filter(w => priceAlerts(w).some(a => a.kind === 'stop'));
    const bigMove = list.filter(w => priceAlerts(w).some(a => a.kind === 'move'));
    const oversoldCount = list.filter(w => w.rsi != null && w.rsi < 30).length;

    return (
      <div className="content">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 18 }}>
          {window.KPI({ label: 'กำลังจับตา', icon: 'eye', value: list.length, sub: <span className="faint">{[...new Set(list.map(w => w.ticker))].length} tickers</span> })}
          {signalMode
            ? window.KPI({ label: 'สัญญาณพร้อมเทรด', icon: 'flame', accent: true, value: active.length, sub: <span className="faint">A+/A/B+/B</span> })
            : window.KPI({ label: 'ถึงโซน Entry', icon: 'target', accent: true, value: entryZone.length, sub: <span className="faint">≤ target</span> })}
          {signalMode
            ? window.KPI({ label: 'ถึงโซน Entry', icon: 'target', value: entryZone.length, sub: <span className="faint">≤ target</span> })
            : window.KPI({ label: 'หลุด Stop', icon: 'pulse', value: stopHit.length, sub: <span className="faint">≤ stop</span> })}
          {signalMode
            ? window.KPI({ label: 'RSI oversold', icon: 'pulse', value: oversoldCount, sub: <span className="faint">{'RSI < 30'}</span> })
            : window.KPI({ label: 'เคลื่อนไหวแรง', icon: 'flame', value: bigMove.length, sub: <span className="faint">{'±5% วันนี้'}</span> })}
        </div>

        <Card pad={false} style={{ marginBottom: 18 }}>
          <div className="card-pad" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
              <Icon name="search" size={16} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-faint)' }} />
              <input className="input" style={{ paddingLeft: 34 }} placeholder="ค้นหา ticker หรือโน้ต…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="btn btn-sm" onClick={refreshPrices} disabled={refreshing} style={refreshing ? { opacity: .6 } : null}>
              <Icon name="reset" size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : null} />
              {refreshing && progress ? `กำลังดึง ${progress.done}/${progress.total}…` : (signalMode ? '🔄 ดึงข้อมูลอัตโนมัติ' : '🔄 อัปเดตราคา')}
            </button>
            <button className={'btn btn-sm' + (signalMode ? ' btn-primary' : '')} onClick={() => window.Store.setSettings({ signalMode: !signalMode })} title="เปิด/ปิดระบบสัญญาณ BB · EMA200 · RSI">
              <Icon name="weekly" size={14} />{signalMode ? 'โหมดสัญญาณ ✓' : 'โหมดสัญญาณ'}
            </button>
            <button className={'btn btn-sm' + (tdKey ? '' : ' btn-primary')} onClick={() => setKeyOpen(o => !o)} title="ตั้งค่า API">
              <Icon name="pulse" size={14} />{tdKey ? 'API ✓' : 'เชื่อม API'}
            </button>
            {signalMode && <button className={'btn btn-sm' + (scrConds().length ? ' btn-primary' : '')} onClick={() => setScrOpen(o => !o)} title="ตั้งเงื่อนไข screener ของคุณเอง">
              <Icon name="weekly" size={14} />{scrConds().length ? `เงื่อนไข (${scrConds().length})` : 'ตั้งเงื่อนไข'}
            </button>}
            {refreshErr && <span className="faint" style={{ fontSize: 12, color: 'var(--neg-bright)' }}>{refreshErr}</span>}
            <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Icon name="plus" size={14} />เพิ่มหุ้นจับตา</button>
          </div>
          {keyOpen && (
            <div className="card-pad" style={{ borderTop: '1px solid var(--border-soft)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Twelve Data API Key <span className="faint" style={{ fontWeight: 400 }}>— {signalMode ? 'ดึงราคา / BB / EMA200 / RSI อัตโนมัติ' : 'ดึงราคาอัตโนมัติ'}</span></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '1 1 240px', fontFamily: 'var(--font-mono)', fontSize: 13 }} placeholder="วาง API key ที่นี่…" value={keyInput} onChange={e => setKeyInput(e.target.value.trim())} />
                <button className="btn btn-primary" onClick={() => { window.Store.setSettings({ tdKey: keyInput.trim() }); setKeyOpen(false); }}><Icon name="check" size={15} />บันทึก</button>
              </div>
              <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>ขอ key ฟรีได้ที่ <span style={{ color: 'var(--accent-2)' }}>twelvedata.com</span> (ไม่ต้องใส่บัตร) · ฟรี 800 ครั้ง/วัน · ระบบดึงทีละตัว (ห่าง 8 วิ) เพื่อไม่ชน rate limit</div>
            </div>
          )}
          {scrOpen && signalMode && (() => {
            const conds = Array.isArray(settings.screenerConditions) ? settings.screenerConditions : [];
            const setC = (next) => window.Store.setSettings({ screenerConditions: next });
            const upd = (i, patch) => setC(conds.map((c, j) => j === i ? { ...c, ...patch } : c));
            const add = () => { if (conds.length >= 3) return; setC([...conds, { metric: 'rsi', op: '<', rhsMetric: null, value: 30 }]); };
            const del = (i) => setC(conds.filter((_, j) => j !== i));
            return (
              <div className="card-pad" style={{ borderTop: '1px solid var(--border-soft)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>เงื่อนไข screener ของคุณ <span className="faint" style={{ fontWeight: 400 }}>— สูงสุด 3 ข้อ · เข้าครบทุกข้อ = ✓ พร้อมเทรด</span></div>
                {conds.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select className="select" style={{ width: 'auto' }} value={c.metric} onChange={e => upd(i, { metric: e.target.value })}>
                      {SCR_MKEYS.map(k => <option key={k} value={k}>{SCR_METRICS[k].label}</option>)}
                    </select>
                    <select className="select" style={{ width: 'auto' }} value={c.op} onChange={e => upd(i, { op: e.target.value })}>
                      {['<', '<=', '>', '>='].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select className="select" style={{ width: 'auto' }} value={c.rhsMetric || '__num'} onChange={e => upd(i, { rhsMetric: e.target.value === '__num' ? null : e.target.value })}>
                      <option value="__num">ตัวเลข</option>
                      {SCR_MKEYS.map(k => <option key={k} value={k}>{SCR_METRICS[k].label}</option>)}
                    </select>
                    {!c.rhsMetric && <input className="input num" style={{ width: 90 }} inputMode="decimal" value={c.value == null ? '' : c.value} onChange={e => upd(i, { value: e.target.value === '' ? null : parseFloat(e.target.value) })} placeholder="ค่า" />}
                    <button className="btn btn-ghost btn-sm icon-btn" onClick={() => del(i)} title="ลบ"><Icon name="trash" size={13} /></button>
                  </div>
                ))}
                {conds.length < 3 && <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={add}><Icon name="plus" size={13} />เพิ่มเงื่อนไข</button>}
                <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>ตัวอย่าง: RSI &lt; 30 · ราคา ≤ BB ล่าง (ช่องขวาเลือก “BB ล่าง”) · %วันนี้ ≤ -3 — หุ้นที่เข้าครบจะขึ้นการ์ดบนสุด</div>
              </div>
            );
          })()}
        </Card>

        {rows.length ? (() => {
          const isCard = signalMode ? (w => grade(w).active) : (w => priceAlerts(w).length > 0);
          const cardRows = rows.filter(isCard);
          const restRows = rows.filter(w => !isCard(w));
          return (
            <React.Fragment>
              {cardRows.length > 0 && (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 14, alignItems: 'start' }}>
                  {cardRows.map(w => <WatchCard key={w.id} w={w} onEdit={setEditing} signalMode={signalMode} />)}
                </div>
              )}
              {restRows.length > 0 && (
                <Card pad={false} style={{ marginTop: cardRows.length ? 18 : 0 }}>
                  <div className="card-pad" style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-soft)' }}>
                    <Icon name="eye" size={15} style={{ color: 'var(--text-faint)' }} />
                    <div className="card-title" style={{ fontSize: 13.5 }}>{signalMode ? <>ยังไม่เข้าเกณฑ์ <span className="th">เฝ้ารออยู่ · {restRows.length} ตัว</span></> : <>กำลังจับตา <span className="th">· {restRows.length} ตัว</span></>}</div>
                  </div>
                  <div>
                    {restRows.map(w => <WatchRow key={w.id} w={w} onEdit={setEditing} signalMode={signalMode} />)}
                  </div>
                </Card>
              )}
            </React.Fragment>
          );
        })() : (
          <Card><div className="empty" style={{ padding: '40px 20px' }}>
            <Icon name="eye" size={28} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
            <div>ยังไม่มีหุ้นในลิสต์จับตา</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{signalMode ? 'กด “เพิ่มหุ้นจับตา” ใส่แค่ ticker → เชื่อม API แล้วกด “ดึงข้อมูล” ระบบดึงราคา · BB · EMA200 · RSI ให้เอง' : 'กด “เพิ่มหุ้นจับตา” ใส่ ticker + ราคา target/stop ที่คุณอยากให้เตือน → เชื่อม API แล้วกด “อัปเดตราคา” ระบบดึงราคาให้เอง'}</div>
          </div></Card>
        )}

        {signalMode && !screenerOn() && (
          <Card style={{ marginTop: 18 }}>
            <div className="card-head"><Icon name="weekly" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">เกณฑ์จัดเกรดสัญญาณ <span className="th">ราคาแตะ BB ล่าง เป็นเงื่อนไขเริ่ม</span></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
              {Object.keys(GRADES).map(k => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <GradeBadge g={k} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>สัญญาณ {k}</div>
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>{GRADES[k].desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Drawer open={!!editing} onClose={() => setEditing(null)}
          title={editing === 'new' ? 'เพิ่มหุ้นจับตา' : (editing && editing.ticker)}
          sub={editing === 'new' ? (signalMode ? 'ใส่แค่ ticker — ระบบดึงข้อมูลและจัดเกรดให้อัตโนมัติ' : 'ใส่ ticker + ราคาที่อยากให้แจ้งเตือน') : 'แก้ไขรายการจับตา'}>
          {editing && <WatchForm initial={editing} signalMode={signalMode} onSave={(w) => { if (editing === 'new') window.Store.addWatch(w); else window.Store.updateWatch(editing.id, w); }}
            onDelete={(id) => window.Store.deleteWatch(id)} onClose={() => setEditing(null)} />}
        </Drawer>
      </div>
    );
  }

  window.WatchlistPage = WatchlistPage;
})();
