/* ============================================================
   trades.jsx — Main trade log: filterable/sortable table +
   strategy-aware smart entry form with live auto-calc.
   Exports window.TradesPage
   ============================================================ */
(function () {
  const { useState, useMemo } = React;
  const { Icon, Card, StatusBadge, ResultBadge, PL, Drawer, Field, Select, NumInput, Confirm } = window;

  const SHORT = { 'Buy Call (Leap)': 'LEAP', 'Bull Put Spread': 'Bull Put', 'Bear Call Spread': 'Bear Call', 'Bear Put Spread': 'Bear Put', 'Calendar Spread': 'Calendar', 'Diagonal Spread': 'Diagonal', 'Synthetic Long': 'Synth Long', 'Long Stock': 'Long', 'Short Stock': 'Short' };
  const sShort = s => SHORT[s] || s;
  const isStockTrade = t => (t.assetType || 'option') === 'stock';

  // legacy spread strategies carried from OptionNLog — logging not wired yet, shown dimmed
  const LEGACY_SPREADS = [];   // ทุก spread รองรับแล้ว
  // per-strategy multi-leg form config
  const SPREAD_CFG = {
    'Bull Put Spread':  { strikes: 2, exps: 1, credit: true,  sellLbl: 'Put ขาขาย (สูง)', buyLbl: 'Put ขาซื้อ (ต่ำ)' },
    'Bear Call Spread': { strikes: 2, exps: 1, credit: true,  sellLbl: 'Call ขาขาย (ต่ำ)', buyLbl: 'Call ขาซื้อ (สูง)' },
    'Bear Put Spread':  { strikes: 2, exps: 1, credit: false, sellLbl: 'Put ขาขาย (ต่ำ)', buyLbl: 'Put ขาซื้อ (สูง)' },
    'Calendar Spread':  { strikes: 1, exps: 2, credit: false, sellLbl: 'ขาใกล้ (ขาย)', buyLbl: 'ขาไกล (ซื้อ)' },
    'Diagonal Spread':  { strikes: 2, exps: 2, credit: false, sellLbl: 'ขาใกล้ (ขาย)', buyLbl: 'ขาไกล (ซื้อ)' },
    'Synthetic Long':   { strikes: 1, exps: 1, credit: false, sellLbl: 'Put (รับ)', buyLbl: 'Call (จ่าย)' },
  };
  const stratOptions = () => window.TL.STRATEGIES.map(s => LEGACY_SPREADS.includes(s)
    ? { value: s, label: s + '  · เร็วๆ นี้', style: { fontStyle: 'italic', color: 'var(--text-faint)' } }
    : s);

  // option setup tags (mirrors the stock lot tag picker)
  const OPT_TAGS = {
    'IV สูง':    { label: 'IV สูง',    color: '#3fd07f' },
    'เก็บ Theta': { label: 'เก็บ Theta', color: '#60a5fa' },
    'แนวรับ':     { label: 'แนวรับ',     color: '#34d399' },
    'แนวต้าน':    { label: 'แนวต้าน',    color: '#ff8da3' },
    'เก็งทิศทาง': { label: 'เก็งทิศทาง', color: '#a78bfa' },
    'Hedge':     { label: 'Hedge',     color: '#22d3ee' },
  };
  const OPT_TAG_KEYS = Object.keys(OPT_TAGS);
  const OPT_OPEN_NOTES = ['IVR สูงขายพรีเมียม', 'เด้งจากแนวรับ', 'ขายชนแนวต้าน', 'เล่นตามเทรนด์', 'เก็บ theta', 'หลังงบ IV ยุบ'];
  const OPT_CLOSE_NOTES = ['ปิดทำกำไรตามแผน', 'ม้วนสัญญา (roll)', 'ตัดขาดทุน', 'ใกล้หมดอายุ', 'หุ้นชน strike'];
  function OptTag({ k }) {
    const t = OPT_TAGS[k]; if (!t) return null;
    return <span className="tagc" style={{ color: t.color, background: t.color + '22', borderColor: t.color + '55' }}><i className="td" style={{ background: t.color }} />{t.label}</span>;
  }

  // ---------- Smart form ----------
  function emptyTrade(assetType) {
    const today = new Date().toISOString().slice(0, 10);
    if (assetType === 'stock') {
      return { assetType: 'stock', date: today, ticker: '', strategy: 'Long Stock', status: 'Opened', strike: null, expiry: null, entryPrice: null, currentPrice: null, deltaIV: '', qty: 100, side: 1, closeDate: null, exitPrice: null, stockAtExit: null, result: '', feeOpen: 0, feeClose: null, openNote: '', closeNote: '' };
    }
    // option is the default — stock now lives on its own "หุ้น" page (lot ledger)
    return { assetType: 'option', date: today, ticker: '', strategy: 'Sell Put', status: 'Opened', strike: null, expiry: null, entryPrice: null, deltaIV: '', qty: 1, side: -1, closeDate: null, exitPrice: null, stockAtExit: null, result: '', feeOpen: -1.76, feeClose: null, longStrike: null, farExpiry: null, sellEntry: null, buyEntry: null, sellExit: null, buyExit: null, tag: null, openNote: '', closeNote: '' };
  }
  function fromTrade(t) {
    // support both old single-fee and new split-fee records
    const feeOpen = t.feeOpen != null ? t.feeOpen : (t.feeClose == null && t.fee != null ? t.fee : -1.76);
    const feeClose = t.feeClose != null ? t.feeClose : null;
    return { ...t, assetType: t.assetType || 'option', qty: Math.abs(t.contracts || 1), side: (t.contracts || 0) < 0 ? -1 : 1, deltaIV: t.deltaIV || '', openNote: t.openNote || '', closeNote: t.closeNote || '', result: t.result || '', feeOpen, feeClose };
  }
  function toTrade(f) {
    const assetType = f.assetType || 'option';
    const stock = assetType === 'stock';
    const contracts = (f.qty || 0) * (f.side || 1);
    // fees are always a cost — normalize to negative so users can type plain numbers
    const feeOpen = -Math.abs(f.feeOpen || 0);
    const feeClose = -Math.abs(f.feeClose || 0);
    const fee = (feeOpen + feeClose) || null;
    const strategy = stock ? (f.side === -1 ? 'Short Stock' : 'Long Stock') : f.strategy;
    const t = { assetType, date: f.date, ticker: (f.ticker || '').toUpperCase().trim(), strategy, status: f.status, strike: stock ? null : f.strike, expiry: stock ? null : f.expiry, entryPrice: f.entryPrice, currentPrice: stock ? (f.currentPrice != null ? f.currentPrice : null) : null, deltaIV: stock ? null : (f.deltaIV || null), exitPrice: f.exitPrice, stockAtExit: stock ? null : f.stockAtExit, contracts, fee, feeOpen, feeClose, closeDate: f.closeDate, result: f.result || null, tag: stock ? null : (f.tag || null), openNote: f.openNote || null, closeNote: f.closeNote || null };
    // vertical spread: derive net premium + 2nd strike from the per-leg inputs
    if (!stock && window.TL.MULTI_LEG.includes(strategy)) {
      const scfg = SPREAD_CFG[strategy] || {};
      const credit = window.TL.CREDIT_SPREADS.includes(strategy);
      const sE = Math.abs(+f.sellEntry || 0), bE = Math.abs(+f.buyEntry || 0);
      t.entryPrice = +(credit ? (sE - bE) : (bE - sE)).toFixed(4);
      t.strike = f.strike != null ? +f.strike : null;
      t.longStrike = (scfg.strikes === 2 && f.longStrike != null) ? +f.longStrike : null;
      t.farExpiry = scfg.exps === 2 ? (f.farExpiry || null) : null;
      t.sellEntry = sE; t.buyEntry = bE;
      const isClosed = f.status === 'Closed' || f.status === 'Rolled';
      if (isClosed) {
        const sX = Math.abs(+f.sellExit || 0), bX = Math.abs(+f.buyExit || 0);
        t.exitPrice = +(credit ? (sX - bX) : (bX - sX)).toFixed(4);
        t.sellExit = sX; t.buyExit = bX;
      } else { t.exitPrice = null; }
    }
    const pl = window.TL.computePL(t);
    t.pl = pl;
    t.ror = window.TL.computeROR(t, pl);
    return t;
  }

  // ---------- Share to X ----------
  function buildTweet(trade) {
    const T = window.TL;
    const ticker  = trade.ticker  || '?';
    const closed  = trade.status === 'Closed' || trade.status === 'Rolled';
    const win     = trade.result === 'Win';
    const loss    = trade.result === 'Loss';
    const pl      = trade.pl   != null ? T.fmtMoneyP(trade.pl, 0)   : null;
    const ror     = trade.ror  != null ? T.fmtPctP(trade.ror, 1)    : null;
    const held    = T.daysHeld(trade);
    const entry   = trade.entryPrice != null ? `$${Number(trade.entryPrice).toFixed(2)}` : '—';
    const exit    = trade.exitPrice != null ? `$${Number(trade.exitPrice).toFixed(2)}` : null;

    // ---- stock trade ----
    if ((trade.assetType || 'option') === 'stock') {
      const shares = Math.abs(trade.contracts || 0);
      const dir = (trade.contracts || 0) < 0 ? 'Short' : 'Long';
      const sl = [];
      if (closed) {
        const emoji = win ? '✅' : loss ? '❌' : '📊';
        const tag = win ? 'WIN 🎯' : loss ? 'LOSS' : trade.status;
        sl.push(`${emoji} $${ticker} ${dir} Stock — ${tag}`);
        if (exit) sl.push(`${shares} shares: ${entry} → ${exit}`);
        if (pl) sl.push(`P/L: ${pl}${ror ? ` | ROR: ${ror}` : ''}`);
        if (held != null) sl.push(`Held: ${held} days`);
      } else {
        sl.push(`📋 Opening $${ticker} ${dir} Stock`);
        sl.push(`${shares} shares @ ${entry}`);
      }
      if (trade.openNote && !closed) sl.push(`📝 ${trade.openNote.slice(0, 60)}${trade.openNote.length>60?'…':''}`);
      if (trade.closeNote && closed) sl.push(`📝 ${trade.closeNote.slice(0, 60)}${trade.closeNote.length>60?'…':''}`);
      const ht = `\n\n#fillbookapp #StockTrading #บันทึกการเทรด $${ticker}`;
      const text = sl.join('\n') + ht;
      return { text, url: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}` };
    }

    // ---- option trade ----
    const strat   = trade.strategy || '?';
    const strike  = trade.strike  != null ? `$${trade.strike}` : '—';
    const expiry  = trade.expiry  ? T.fmtDate(trade.expiry)   : '—';
    const qty     = Math.abs(trade.contracts || 1);
    const dte     = T.dte(trade);

    let lines = [];

    if (closed) {
      const emoji = win ? '✅' : loss ? '❌' : '📊';
      const tag   = win ? 'WIN 🎯' : loss ? 'LOSS' : trade.status;
      lines.push(`${emoji} $${ticker} ${strat} — ${tag}`);
      lines.push(`Strike ${strike} | Exp ${expiry}`);
      if (exit) lines.push(`Entry ${entry} → Exit ${exit} × ${qty} contract${qty>1?'s':''}`);
      if (pl)  lines.push(`P/L: ${pl}${ror ? ` | ROR: ${ror}` : ''}`);
      if (held != null) lines.push(`Held: ${held} days`);
    } else {
      lines.push(`📋 Opening $${ticker} ${strat}`);
      lines.push(`Strike ${strike} | Exp ${expiry}`);
      lines.push(`Entry ${entry} × ${qty} contract${qty>1?'s':''}`);
      if (dte != null) lines.push(`DTE: ${dte} days`);
    }

    if (trade.openNote && !closed) lines.push(`📝 ${trade.openNote.slice(0, 60)}${trade.openNote.length>60?'…':''}`);
    if (trade.closeNote && closed) lines.push(`📝 ${trade.closeNote.slice(0, 60)}${trade.closeNote.length>60?'…':''}`);
    if (trade.tag) lines.push(`🏷️ ${trade.tag}`);

    const hashtags = `\n\n#fillbookapp #OptionTradingLog #บันทึกการเทรดออปชั่น #${(strat.replace(/\s+/g,''))} $${ticker}`;
    const text = lines.join('\n') + hashtags;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    return { text, url };
  }

  function ShareModal({ trade, onClose }) {
    const { useState: us, useRef: ur } = React;
    const [copied, setCopied] = us(false);
    const taRef = ur(null);
    const { text, url } = buildTweet(trade);
    const diagRef = ur(null);
    const [imgMsg, setImgMsg] = us('');
    const payoffOk = window.payoffSupported && window.payoffSupported(trade);
    const downloadImage = async () => {
      if (!diagRef.current || !window.html2canvas) return;
      setImgMsg('กำลังสร้างรูป…');
      try {
        const bg = getComputedStyle(document.body).backgroundColor || '#0a0d13';
        const canvas = await window.html2canvas(diagRef.current, { backgroundColor: bg, scale: 2, logging: false });
        canvas.toBlob((blob) => {
          if (!blob) { setImgMsg('สร้างรูปไม่สำเร็จ'); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url;
          a.download = `${trade.ticker}_${trade.strategy}`.replace(/\s+/g, '_') + '.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          setImgMsg('✓ ดาวน์โหลดรูปแล้ว — แนบรูปตอนโพสต์ได้เลย');
          setTimeout(() => setImgMsg(''), 2800);
        });
      } catch (e) { setImgMsg('สร้างรูปไม่สำเร็จ'); }
    };

    const copy = () => {
      const done = () => { setCopied(true); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          if (taRef.current) { taRef.current.focus(); taRef.current.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
        });
      } else if (taRef.current) {
        taRef.current.focus(); taRef.current.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    };

    return (
      <>
        <div className="scrim" style={{ zIndex: 130 }} onClick={onClose} />
        <div className="copy-modal" role="dialog" aria-label="แชร์เทรด">
          <div className="copy-modal-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600, fontSize: 15 }}>
              <svg width="16" height="16" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"/></svg>
              แชร์เทรด <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>· แบบที่จะนำไปวาง</span>
            </div>
            <button className="btn btn-ghost icon-btn" onClick={onClose}><Icon name="close" /></button>
          </div>
          <div className="copy-modal-body" style={{ overflowY: 'auto', maxHeight: '66vh', padding: payoffOk ? '14px 14px 0' : 0 }}>
            {payoffOk && <div ref={diagRef}><window.PayoffDiagram trade={trade} /></div>}
            <textarea ref={taRef} className="copy-ta" readOnly value={text} onFocus={e => e.target.select()} style={payoffOk ? { height: 150, marginTop: 12 } : null} />
          </div>
          <div className="copy-modal-foot">
            <span className="faint" style={{ fontSize: 11.5, flex: 1 }}>{imgMsg || (copied ? 'คัดลอกแล้ว — วางได้เลย' : (payoffOk ? 'กด Copy ข้อความ · ดาวน์โหลดรูป · หรือเปิด X' : 'กด Copy หรือเลือกข้อความเองก็ได้'))}</span>
            {payoffOk && <button className="btn" onClick={downloadImage} title="ดาวน์โหลดรูป payoff diagram"><Icon name="download" size={15} />ดาวน์โหลดรูป</button>}
            <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'คัดลอกแล้ว' : 'Copy'}</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"/></svg>
              เปิด X
            </a>
          </div>
        </div>
      </>
    );
  }

  function TradeForm({ initial, onSave, onCancel, onDelete }) {
    const T = window.TL;
    const [f, setF] = useState(initial);
    const [shareOpen, setShareOpen] = useState(false);
    const set = (k, v) => setF(p => {
      const n = { ...p, [k]: v };
      if (k === 'strategy') n.side = T.defaultContractSign(v);
      if (k === 'status' && v === 'Closed' && !n.closeDate) n.closeDate = new Date().toISOString().slice(0, 10);
      if (k === 'status' && (v === 'Closed' || v === 'Rolled') && (n.qtyClosed == null || n.qtyClosed === '')) n.qtyClosed = n.qty;
      if (k === 'qty' && n.qtyClosed != null && n.qtyClosed > v) n.qtyClosed = v;
      return n;
    });
    const isStock = isStockTrade(f);
    const setAsset = (type) => setF(p => {
      const base = emptyTrade(type);
      return { ...base, date: p.date, ticker: p.ticker, entryPrice: p.entryPrice, qty: p.qty, status: p.status, closeDate: p.closeDate, exitPrice: p.exitPrice, result: p.result, openNote: p.openNote, closeNote: p.closeNote, feeClose: p.feeClose };
    });
    const isLongS = T.LONG_STRATS.includes(f.strategy);
    // strategies that are always sell: lock side
    const lockSell = ['Sell Put','Sell Call','Bull Put Spread','Bear Call Spread'].includes(f.strategy);
    const lockBuy = ['Buy Call','Buy Call (Leap)','Buy Put','Bear Put Spread','Calendar Spread','Diagonal Spread','Synthetic Long'].includes(f.strategy);
    const cfg = !isStock ? SPREAD_CFG[f.strategy] : null;
    const isMulti = !!cfg;
    const isCredit = !!(cfg && cfg.credit);
    const spW = (cfg && cfg.strikes === 2 && f.strike != null && f.longStrike != null) ? Math.abs((+f.strike) - (+f.longStrike)) : null;
    const sEntryP = Math.abs(+f.sellEntry || 0), bEntryP = Math.abs(+f.buyEntry || 0);
    const netEntryP = isCredit ? (sEntryP - bEntryP) : (bEntryP - sEntryP);
    const contracts = (f.qty || 0) * (f.side || 1);
    const contractsLabel = contracts > 0 ? `+${contracts} (Buy/Long)` : `${contracts} (Sell/Short)`;
    const closed = f.status === 'Closed' || f.status === 'Rolled';
    const fullQty = Math.abs(f.qty || 0);
    const closedQty = (closed && f.qtyClosed != null && f.qtyClosed !== '') ? Math.abs(f.qtyClosed) : fullQty;
    const isPartial = closed && closedQty > 0 && closedQty < fullQty;
    const remQty = Math.max(0, fullQty - closedQty);
    const t = toTrade(isPartial ? { ...f, qty: closedQty } : f);
    const dte = T.dte(t), held = T.daysHeld(t), ann = T.annualizedROR(t, t.ror), notl = T.notional(t), unreal = T.unrealized(t);
    const valid = f.ticker && f.date && (isStock || f.strategy);

    const calcRow = (label, val, cls) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 13 }}>
        <span className="muted">{label}</span><span className={'num ' + (cls || '')} style={{ fontWeight: 600 }}>{val}</span>
      </div>
    );

    return (
      <>
        <div className="drawer-body">
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="วันที่เข้า" hint="Entry"><input className="input" type="date" value={f.date || ''} onChange={e => set('date', e.target.value)} /></Field>
            <Field label="Ticker"><input className="input input-mono" style={{ textTransform: 'uppercase' }} value={f.ticker} placeholder={isStock ? 'AAPL' : 'NVDA'} onChange={e => set('ticker', e.target.value)} /></Field>

            {isStock ? (
              <>
                <Field label="ทิศทาง" hint="Direction">
                  <div className="seg" style={{ width: '100%' }}>
                    <button className={f.side === 1 ? 'on' : ''} style={{ flex: 1 }} onClick={() => set('side', 1)}>Long / Buy</button>
                    <button className={f.side === -1 ? 'on' : ''} style={{ flex: 1 }} onClick={() => set('side', -1)}>Short / Sell</button>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11.5, color: contracts < 0 ? 'var(--neg-bright)' : 'var(--pos-bright)', fontFamily: 'var(--font-mono)' }}>
                    บันทึก: <strong>{contracts > 0 ? `+${contracts} หุ้น (Long)` : `${contracts} หุ้น (Short)`}</strong>
                  </div>
                </Field>
                <Field label="จำนวนหุ้น" hint="Shares (ใส่บวกเสมอ)"><NumInput value={f.qty} onChange={v => set('qty', v)} step="1" /></Field>
                <Field label="ราคาเข้า (ต่อหุ้น)" hint="Entry $/share"><NumInput value={f.entryPrice} onChange={v => set('entryPrice', v)} placeholder="0.00" /></Field>
                {f.status === 'Opened' && <Field label="ราคาปัจจุบัน" hint="Current — ไว้คิด unrealized"><NumInput value={f.currentPrice} onChange={v => set('currentPrice', v)} placeholder="ใส่หรือดึงอัตโนมัติ" /></Field>}
                <Field label="สถานะ" hint="Status"><Select value={f.status} onChange={v => set('status', v)} options={T.STATUSES} /></Field>
                <Field label="ค่าธรรมเนียมเข้า" hint="ใส่ตัวเลข · หักอัตโนมัติ"><NumInput value={f.feeOpen} onChange={v => set('feeOpen', v)} placeholder="0" /></Field>
              </>
            ) : (
              <>
                <Field label="กลยุทธ์" hint="Strategy" span><Select value={f.strategy} onChange={v => set('strategy', v)} options={stratOptions()} /></Field>

                {isMulti ? (
                  <>
                    {cfg.strikes === 2 ? (
                      <>
                        <Field label="Strike ขาขาย" hint="Sell leg"><NumInput value={f.strike} onChange={v => set('strike', v)} placeholder="0.00" /></Field>
                        <Field label="Strike ขาซื้อ" hint="Buy leg"><NumInput value={f.longStrike} onChange={v => set('longStrike', v)} placeholder="0.00" /></Field>
                      </>
                    ) : (
                      <Field label="Strike" hint={f.strategy === 'Synthetic Long' ? 'Call + Put strike เดียวกัน' : 'Strike เดียว'} span><NumInput value={f.strike} onChange={v => set('strike', v)} placeholder="0.00" /></Field>
                    )}
                    {cfg.exps === 2 ? (
                      <>
                        <Field label="หมดอายุขาใกล้" hint="Near (ขาย)"><input className="input" type="date" value={f.expiry || ''} onChange={e => set('expiry', e.target.value)} /></Field>
                        <Field label="หมดอายุขาไกล" hint="Far (ซื้อ)"><input className="input" type="date" value={f.farExpiry || ''} onChange={e => set('farExpiry', e.target.value)} /></Field>
                      </>
                    ) : (
                      <Field label="วันหมดอายุ" hint="Expiry"><input className="input" type="date" value={f.expiry || ''} onChange={e => set('expiry', e.target.value)} /></Field>
                    )}
                    <Field label={'พรีเมียม ' + cfg.sellLbl + ' (เข้า)'} hint="ที่ได้รับ"><NumInput value={f.sellEntry} onChange={v => set('sellEntry', v)} placeholder="0.00" /></Field>
                    <Field label={'พรีเมียม ' + cfg.buyLbl + ' (เข้า)'} hint="ที่จ่าย"><NumInput value={f.buyEntry} onChange={v => set('buyEntry', v)} placeholder="0.00" /></Field>
                    <Field label="Delta / IV%"><input className="input input-mono" value={f.deltaIV} placeholder="0.30 / 45" onChange={e => set('deltaIV', e.target.value)} /></Field>
                    <Field label="พรีเมียมสุทธิ" hint={isCredit ? 'Net credit' : 'Net debit'} span>
                      <div className="input calc num" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={isCredit ? 'pos' : 'neg'} style={{ fontWeight: 600 }}>{isCredit ? '+' : '−'}{Math.abs(netEntryP).toFixed(2)} {isCredit ? 'credit' : 'debit'}</span>
                        {spW != null && <span className="faint" style={{ fontSize: 12 }}>width {spW.toFixed(2)}</span>}
                      </div>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Strike"><NumInput value={f.strike} onChange={v => set('strike', v)} placeholder="0.00" /></Field>
                    <Field label="วันหมดอายุ" hint="Expiry"><input className="input" type="date" value={f.expiry || ''} onChange={e => set('expiry', e.target.value)} /></Field>
                    <Field label={isLongS ? 'พรีเมียมจ่าย (เข้า)' : 'พรีเมียมรับ (เข้า)'} hint="Entry $"><NumInput value={f.entryPrice} onChange={v => set('entryPrice', v)} placeholder="0.00" /></Field>
                    <Field label="Delta / IV%"><input className="input input-mono" value={f.deltaIV} placeholder="0.30 / 45" onChange={e => set('deltaIV', e.target.value)} /></Field>
                  </>
                )}

                <Field label="จำนวนสัญญา" hint="Qty (ใส่บวกเสมอ)"><NumInput value={f.qty} onChange={v => set('qty', v)} step="1" /></Field>
                <Field label="ทิศทาง">
                  {lockSell
                    ? <div className="input" style={{ background: 'var(--neg-soft)', color: 'var(--neg-bright)', fontWeight: 600, border: '1px solid rgba(229,72,77,.3)' }}>Sell / Credit (อัตโนมัติ)</div>
                    : lockBuy
                      ? <div className="input" style={{ background: 'var(--pos-soft)', color: 'var(--pos-bright)', fontWeight: 600, border: '1px solid rgba(38,162,105,.3)' }}>Buy / Debit (อัตโนมัติ)</div>
                      : <div className="seg" style={{ width: '100%' }}>
                          <button className={f.side === -1 ? 'on' : ''} style={{ flex: 1 }} onClick={() => set('side', -1)}>Sell / Credit</button>
                          <button className={f.side === 1 ? 'on' : ''} style={{ flex: 1 }} onClick={() => set('side', 1)}>Buy / Debit</button>
                        </div>}
                  <div style={{ marginTop: 5, fontSize: 11.5, color: contracts < 0 ? 'var(--neg-bright)' : 'var(--pos-bright)', fontFamily: 'var(--font-mono)' }}>
                    สัญญาที่บันทึก: <strong>{contractsLabel}</strong>
                  </div>
                </Field>

                <Field label="สถานะ" hint="Status"><Select value={f.status} onChange={v => set('status', v)} options={T.STATUSES} /></Field>
                <Field label="Fee เปิด" hint="ใส่ตัวเลข · หักอัตโนมัติ"><NumInput value={f.feeOpen} onChange={v => set('feeOpen', v)} placeholder="1.76" /></Field>
              </>
            )}

            {closed && <>
              <Field label="วันที่ปิด" hint="Close"><input className="input" type="date" value={f.closeDate || ''} onChange={e => set('closeDate', e.target.value)} /></Field>
              {isMulti ? (
                <>
                  <Field label={'พรีเมียม ' + cfg.sellLbl + ' (ออก)'} hint="ราคาปิด"><NumInput value={f.sellExit} onChange={v => set('sellExit', v)} placeholder="0.00" /></Field>
                  <Field label={'พรีเมียม ' + cfg.buyLbl + ' (ออก)'} hint="ราคาปิด"><NumInput value={f.buyExit} onChange={v => set('buyExit', v)} placeholder="0.00" /></Field>
                </>
              ) : (
                <Field label={isStock ? 'ราคาออก (ต่อหุ้น)' : (isLongS ? 'พรีเมียมรับ (ออก)' : 'พรีเมียมจ่าย (ออก)')} hint="Exit $"><NumInput value={f.exitPrice} onChange={v => set('exitPrice', v)} placeholder="0.00" /></Field>
              )}
              <Field label={isStock ? 'จำนวนที่ขาย/ปิด' : 'จำนวนสัญญาที่ปิด'} hint={'Qty closed · ถือทั้งหมด ' + fullQty} span>
                <NumInput value={f.qtyClosed != null ? f.qtyClosed : f.qty} onChange={v => set('qtyClosed', v)} step="1" max={fullQty} />
                {isPartial
                  ? <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--accent-2)', fontFamily: 'var(--font-mono)' }}>ปิดบางส่วน {closedQty} · เหลือถือต่อ <strong>{remQty}</strong> {isStock ? 'หุ้น' : 'สัญญา'} — จะแยกเป็นโพสิชันเปิดให้อัตโนมัติ</div>
                  : <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--text-faint)' }}>ปิดทั้งหมด — ใส่จำนวนน้อยกว่านี้ถ้าขายแค่บางส่วน</div>}
              </Field>
              <Field label={isStock ? 'ค่าธรรมเนียมออก' : 'Fee ปิด'} hint="ใส่ตัวเลข · หักอัตโนมัติ"><NumInput value={f.feeClose} onChange={v => set('feeClose', v)} placeholder="1.76" /></Field>
              <Field label={isStock ? 'ค่าธรรมเนียมรวม' : 'Fee รวม'} hint="คำนวณอัตโนมัติ">
                <div className="input calc num" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="faint" style={{ fontSize: 12 }}>{-Math.abs(f.feeOpen || 0)} + {-Math.abs(f.feeClose || 0)}</span>
                  <span style={{ fontWeight: 600 }}>{(-Math.abs(f.feeOpen || 0) - Math.abs(f.feeClose || 0)).toFixed(2)}</span>
                </div>
              </Field>
              <Field label="ผลลัพธ์" hint="Result">
                <div className="seg" style={{ width: '100%' }}>
                  <button className={f.result === 'Win' ? 'on' : ''} style={{ flex: 1 }} onClick={() => set('result', 'Win')}>Win</button>
                  <button className={f.result === 'Loss' ? 'on' : ''} style={{ flex: 1 }} onClick={() => set('result', 'Loss')}>Loss</button>
                </div>
              </Field>
              {!isStock && <Field label="ราคาหุ้นวันออก" hint="Stock@exit"><NumInput value={f.stockAtExit} onChange={v => set('stockAtExit', v)} /></Field>}
            </>}

            {!isStock && (
              <Field label="แท็ก setup" hint="ไม่บังคับ · เลือกเหตุผลหลัก" span>
                <div className="tag-pick">{OPT_TAG_KEYS.map(k => <span key={k} className={'tag-opt' + (f.tag === k ? ' on' : '')} onClick={() => set('tag', f.tag === k ? null : k)}><OptTag k={k} /></span>)}</div>
              </Field>
            )}
            <Field label="บันทึกการเปิด (เหตุผล/setup)" span>
              <textarea className="input" value={f.openNote} placeholder={isStock ? 'ทำไมถึงซื้อหุ้นนี้ — setup, แนวรับ, แผน...' : 'ทำไมถึงเข้าเทรดนี้ — setup, IVR, view...'} onChange={e => set('openNote', e.target.value)} />
              {!isStock && <div className="pill-row" style={{ marginTop: 8 }}>{OPT_OPEN_NOTES.map(q => <span key={q} className="note-tag" onClick={() => set('openNote', f.openNote ? f.openNote + ' · ' + q : q)}>{q}</span>)}</div>}
            </Field>
            {closed && <Field label="บันทึกการปิด" span>
              <textarea className="input" value={f.closeNote} placeholder="เหตุผลที่ปิด / การจัดการ..." onChange={e => set('closeNote', e.target.value)} />
              {!isStock && <div className="pill-row" style={{ marginTop: 8 }}>{OPT_CLOSE_NOTES.map(q => <span key={q} className="note-tag" onClick={() => set('closeNote', f.closeNote ? f.closeNote + ' · ' + q : q)}>{q}</span>)}</div>}
            </Field>}
          </div>

          <div className="card card-pad" style={{ marginTop: 18, background: 'var(--surface-2)' }}>
            <div className="card-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="pulse" size={15} style={{ color: 'var(--accent-2)' }} />คำนวณอัตโนมัติ <span className="th" style={{ fontWeight: 400 }}>Auto-calc</span></div>
            {calcRow('กำไร/ขาดทุน (P/L)', t.pl == null ? '— ยังไม่ปิด' : T.fmtMoneyP(t.pl, 2), t.pl == null ? '' : t.pl > 0 ? 'pos' : t.pl < 0 ? 'neg' : '')}
            {calcRow('ROR', t.ror == null ? '—' : T.fmtPctP(t.ror, 2), t.ror == null ? '' : t.ror > 0 ? 'pos' : 'neg')}
            {isMulti && spW != null && calcRow('ความกว้าง spread (width)', '$' + spW.toFixed(2))}
            {isMulti && (() => { const v = T.spreadMaxProfit(t); return v == null ? null : calcRow('กำไรสูงสุด (max profit)', T.fmtMoney(v), 'pos'); })()}
            {isMulti && (() => { const v = T.spreadMaxLoss(t); return v == null ? null : calcRow('ขาดทุนสูงสุด (max loss · ฐาน ROR)', '−' + T.fmtMoney(v), 'neg'); })()}
            {calcRow('Annualized ROR', ann == null ? '—' : T.fmtPctP(ann, 1), ann == null ? '' : ann > 0 ? 'pos' : 'neg')}
            {!isStock && calcRow('DTE (วันถึงหมดอายุ)', dte == null ? '—' : dte + ' วัน')}
            {calcRow('ถือมาแล้ว (Days held)', held == null ? '—' : held + ' วัน')}
            {isStock && f.entryPrice != null && calcRow('มูลค่าเข้า (Cost)', T.fmtMoney(Math.abs(contracts) * f.entryPrice))}
            {isStock && f.status === 'Opened' && f.currentPrice != null && calcRow('มูลค่าปัจจุบัน', T.fmtMoney(Math.abs(contracts) * f.currentPrice))}
            {isStock && f.status === 'Opened' && unreal != null && calcRow('Unrealized P/L', T.fmtMoneyP(unreal, 2), unreal > 0 ? 'pos' : unreal < 0 ? 'neg' : '')}
            {notl != null && calcRow('Notional exposure', T.fmtMoney(notl))}
          </div>
        </div>
        <div className="drawer-foot">
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}><Icon name="trash" size={15} />ลบ</button>}
          {onDelete && <button className="btn" title="แชร์" style={{ padding: '0 12px', background: 'var(--surface-2)' }} onClick={() => setShareOpen(true)}>
            <Icon name="share" size={15} style={{ display: 'block' }} />
            Share
          </button>}
          <button className="btn" onClick={onCancel}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!valid} style={!valid ? { opacity: .5, cursor: 'not-allowed' } : null} onClick={() => onSave(toTrade(f), f)}><Icon name="check" size={15} />บันทึกเทรด</button>
        </div>
        {shareOpen && <ShareModal trade={toTrade(f)} onClose={() => setShareOpen(false)} />}
      </>
    );
  }

  // ---------- Table ----------
  function TradesPage({ accent }) {
    const state = window.useStore();
    const T = window.TL;
    const [q, setQ] = useState('');
    const [stratF, setStratF] = useState('all');
    const [statusF, setStatusF] = useState('all');
    const [assetF, setAssetF] = useState('all');
    const [sort, setSort] = useState({ key: 'date', dir: -1 });
    const [editing, setEditing] = useState(null); // trade obj or 'new' or null
    const [confirmDel, setConfirmDel] = useState(null);
    const [showLimit, setShowLimit] = useState(false);
    const atLimit = !window.IS_PRO && state.trades.filter(t => (t.assetType || 'option') === 'option').length >= (window.FREE_TRADE_LIMIT || 50);
    const openNewTrade = () => { if (atLimit) setShowLimit(true); else setEditing('new'); };

    const rows = useMemo(() => {
      let r = state.trades.filter(t => (t.assetType || 'option') === 'option');
      if (q) { const ql = q.toLowerCase(); r = r.filter(t => (t.ticker || '').toLowerCase().includes(ql) || (t.strategy || '').toLowerCase().includes(ql) || (t.openNote || '').toLowerCase().includes(ql) || (t.closeNote || '').toLowerCase().includes(ql)); }
      if (stratF !== 'all') r = r.filter(t => t.strategy === stratF);
      if (statusF !== 'all') r = r.filter(t => t.status === statusF);
      const { key, dir } = sort;
      r.sort((a, b) => {
        let av = a[key], bv = b[key];
        if (key === 'contracts') { av = Math.abs(av || 0); bv = Math.abs(bv || 0); }
        if (av == null) return 1; if (bv == null) return -1;
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
      return r;
    }, [state.trades, q, stratF, statusF, sort]);

    const setSortKey = k => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
    const Th = ({ k, children, cls }) => (
      <th className={cls} onClick={() => setSortKey(k)}>{children}{sort.key === k && <span className="sort-ar">{sort.dir === 1 ? '↑' : '↓'}</span>}</th>
    );

    const assetBase = state.trades.filter(t => (t.assetType || 'option') === 'option');
    const open = assetBase.filter(t => t.status === 'Opened');
    const m = T.metrics(assetBase);
    const optRealized = m.net;

    return (
      <div className="content">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 18 }}>
          {window.KPI({ label: 'เทรดออปชั่น', icon: 'trades', value: assetBase.length, sub: <span className="faint">{m.count} ปิดแล้ว · {m.opened} เปิดอยู่</span> })}
          {window.KPI({ label: 'Win Rate', icon: 'target', accent: true, value: T.fmtPct(m.winRate, 1), sub: <span className="faint">{m.wins}W / {m.losses}L</span> })}
          {window.KPI({ label: 'Options Realized', icon: 'flame', value: <PL value={optRealized} dp={0} />, sub: <span className="faint">ออปชั่นปิดแล้ว</span> })}
          {window.KPI({ label: 'Profit Factor', icon: 'pulse', value: m.profitFactor === Infinity ? '∞' : T.fmtNum(m.profitFactor, 2), sub: <span className="faint">กำไร/ขาดทุน</span> })}
          {window.KPI({ label: 'โพสิชันเปิดอยู่', icon: 'layers', value: open.length, sub: <span className="faint">{[...new Set(open.map(t => t.ticker))].length} tickers</span> })}
        </div>

        <Card pad={false}>
          <div className="card-pad" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
              <Icon name="search" size={16} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-faint)' }} />
              <input className="input" style={{ paddingLeft: 34 }} placeholder="ค้นหา ticker, กลยุทธ์, โน้ต…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <select className="select" style={{ width: 'auto' }} value={stratF} onChange={e => setStratF(e.target.value)}>
              <option value="all">ทุกกลยุทธ์</option>
              {T.STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={statusF} onChange={e => setStatusF(e.target.value)}>
              <option value="all">ทุกสถานะ</option>
              {T.STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {!window.IS_PRO && <span className="free-usage" title="แพ็กเกจฟรีบันทึกเทรดออปชั่นได้สูงสุด 20 รายการ"><span className="num">{state.trades.filter(t => (t.assetType || 'option') === 'option').length}</span>/{window.FREE_TRADE_LIMIT || 20}</span>}
            <button className="btn btn-primary" onClick={openNewTrade}><Icon name="plus" size={16} />เพิ่มเทรด</button>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <Th k="date">วันที่</Th>
                  <Th k="ticker">Ticker</Th>
                  <Th k="strategy">กลยุทธ์</Th>
                  <Th k="strike" cls="r">Strike</Th>
                  <Th k="entryPrice" cls="r">เข้า</Th>
                  <Th k="exitPrice" cls="r">ออก</Th>
                  <Th k="contracts" cls="r">จำนวน</Th>
                  <Th k="dte" cls="r">DTE</Th>
                  <Th k="pl" cls="r">P/L</Th>
                  <Th k="ror" cls="r">ROR</Th>
                  <Th k="status" cls="c">สถานะ</Th>
                  <Th k="result" cls="c">ผล</Th>
                  <th className="no-sort">โน้ต</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(t => {
                  const dte = T.dte(t);
                  return (
                    <tr key={t.id} className="row-click" onClick={() => setEditing(t)}>
                      <td className="num muted">{T.fmtDate(t.date)}</td>
                      <td><span className="tkr">{t.ticker}</span></td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className={'asset-tag ' + (isStockTrade(t) ? 'stk' : 'opt')}>{isStockTrade(t) ? 'STK' : 'OPT'}</span><span style={{ fontSize: 12.5 }}>{sShort(t.strategy)}</span></div></td>
                      <td className="r num">{t.strike != null ? t.strike : '—'}</td>
                      <td className="r num muted">{t.entryPrice != null ? T.fmtNum(t.entryPrice, 2) : '—'}</td>
                      <td className="r num muted">{t.exitPrice != null ? T.fmtNum(t.exitPrice, 2) : (isStockTrade(t) && t.status === 'Opened' && t.currentPrice != null ? <span style={{ color: 'var(--accent-2)' }} title="ราคาปัจจุบัน">{T.fmtNum(t.currentPrice, 2)}</span> : '—')}</td>
                      <td className="r num">{t.contracts != null ? t.contracts : '—'}</td>
                      <td className="r num faint">{dte != null ? dte : '—'}</td>
                      <td className="r">{(() => { const u = T.unrealized(t); return u != null ? <span title="unrealized P/L"><PL value={u} dp={0} /><span className="faint" style={{ fontSize: 10, marginLeft: 2 }}>~</span></span> : <PL value={t.pl} dp={0} />; })()}</td>
                      <td className="r num" style={{ color: t.ror > 0 ? 'var(--pos-bright)' : t.ror < 0 ? 'var(--neg-bright)' : 'var(--text-faint)' }}>{t.ror != null ? T.fmtPctP(t.ror, 1) : '—'}</td>
                      <td className="c"><StatusBadge status={t.status} /></td>
                      <td className="c"><ResultBadge result={t.result} /></td>
                      <td><div className="t-note">{t.openNote || t.closeNote || ''}</div></td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={13}><div className="empty">ไม่พบเทรดที่ตรงกับเงื่อนไข</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card-pad" style={{ borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', color: 'var(--text-faint)', fontSize: 12.5 }}>
            <span>แสดง {rows.length} จาก {assetBase.length} เทรดออปชั่น</span>
            <span className="num">Net (filtered): <PL value={rows.filter(T.isRealized).reduce((s, t) => s + (t.pl || 0), 0)} /></span>
          </div>
        </Card>

        <Drawer open={!!editing} onClose={() => setEditing(null)}
          title={editing === 'new' ? 'เพิ่มเทรดใหม่' : (editing && editing.ticker + ' · ' + sShort(editing.strategy))}
          sub={editing === 'new' ? 'กรอกข้อมูล — P/L และ ROR คำนวณให้อัตโนมัติ' : 'แก้ไขรายละเอียดเทรด'}>
          {editing && <TradeForm
            initial={editing === 'new' ? emptyTrade() : fromTrade(editing)}
            onSave={(t, f) => {
              const isClosed = t.status === 'Closed' || t.status === 'Rolled';
              const fullQty = Math.abs(f.qty || 0);
              const closedQty = (f.qtyClosed != null && f.qtyClosed !== '') ? Math.abs(f.qtyClosed) : fullQty;
              const partial = isClosed && closedQty > 0 && closedQty < fullQty;
              if (!partial) {
                if (editing === 'new') window.Store.addTrade(t); else window.Store.updateTrade(editing.id, t);
                setEditing(null); return;
              }
              const remQty = fullQty - closedQty;
              const propFee = (fee, q) => fee != null ? +((fee * q) / fullQty).toFixed(2) : fee;
              const realized = toTrade({ ...f, qty: closedQty, feeOpen: propFee(f.feeOpen, closedQty) });
              const remainOpen = toTrade({ ...f, qty: remQty, status: 'Opened', closeDate: null, exitPrice: null, result: '', feeClose: null, closeNote: '', qtyClosed: null, feeOpen: propFee(f.feeOpen, remQty) });
              if (editing === 'new') { window.Store.addTrade(realized); window.Store.addTrade(remainOpen); }
              else { window.Store.updateTrade(editing.id, realized); window.Store.addTrade(remainOpen); }
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
            onDelete={editing === 'new' ? null : () => setConfirmDel(editing)} />}
        </Drawer>

        <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} danger
          title="ลบเทรดนี้?" body={confirmDel && (confirmDel.ticker + ' ' + confirmDel.strategy + ' — การลบไม่สามารถย้อนกลับได้')}
          onConfirm={() => { window.Store.deleteTrade(confirmDel.id); setEditing(null); }} />

        {showLimit && <window.TradeLimitModal count={state.trades.filter(t => (t.assetType || 'option') === 'option').length} limit={window.FREE_TRADE_LIMIT || 50} onClose={() => setShowLimit(false)} />}
      </div>
    );
  }

  function TradeLimitModal({ count, limit, onClose }) {
    const goPricing = () => { try { window.location.href = 'upgrade.html'; } catch (e) {} };
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(5,7,10,0.66)', backdropFilter: 'blur(3px)' }}>
        <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 440, width: '100%', background: 'var(--surface, #11151d)', border: '1px solid var(--accent-line, rgba(59,130,246,0.42))', borderRadius: 20, padding: '38px 34px', boxShadow: '0 40px 90px -50px rgba(0,0,0,0.9)' }}>
          <div style={{ width: 60, height: 60, margin: '0 auto 18px', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--accent-soft, rgba(59,130,246,0.14))', border: '1px solid var(--accent-line, rgba(59,130,246,0.42))' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2, #60a5fa)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          </div>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: 'linear-gradient(180deg,#60a5fa,#3b82f6)', borderRadius: 99, padding: '4px 13px', marginBottom: 15 }}>PRO</span>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', margin: '0 0 8px' }}>ครบ {limit} รายการแล้ว</h2>
          <p style={{ color: 'var(--text-dim, #97a2b3)', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 24px' }}>
            แพ็กเกจฟรีบันทึกเทรดออปชั่นได้สูงสุด <b style={{ color: 'var(--text, #e8ecf3)' }}>{limit} รายการ</b> (ตอนนี้ {count}/{limit}) — อัปเกรดเป็น Pro เพื่อบันทึกเทรด<b style={{ color: 'var(--text, #e8ecf3)' }}>ไม่จำกัด</b> พร้อมปลดล็อกทุกฟีเจอร์
          </p>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 15.5 }} onClick={goPricing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}><path d="M5 16L3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5z"/></svg>
            อัปเกรดเป็น Pro
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 10 }} onClick={onClose}>ไว้ภายหลัง</button>
        </div>
      </div>
    );
  }
  window.TradeLimitModal = TradeLimitModal;

  window.TradesPage = TradesPage;
})();
