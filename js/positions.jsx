/* ============================================================
   positions.jsx — "หุ้น" page: stock lot-ledger (average cost).
   Accumulate (ทยอยซื้อ) → avg cost → scale out (ทยอยขาย),
   per-lot reason note + tag + confidence + optional chart link.
   Allocation donut includes one combined "Options" slice.
   Exports window.StocksPage. Data: Store.positions (synced via meta).
   ============================================================ */
(function () {
  const { useState, useMemo } = React;
  const { Icon, Card, Field, NumInput, Confirm } = window;
  const FINNHUB_KEY = 'd8ods19r01qrbffl14v0d8ods19r01qrbffl14vg';

  const TAGS = {
    'เก็บของ':   { label: 'เก็บของ',   color: '#3fd07f' },
    'DCA':       { label: 'DCA',       color: '#60a5fa' },
    'ซื้อเพิ่ม':  { label: 'ซื้อเพิ่ม',  color: '#a78bfa' },
    'ทำกำไร':    { label: 'ทำกำไร',    color: '#26a269' },
    'ตัดขาดทุน': { label: 'ตัดขาดทุน', color: '#ff6166' },
    'รีบาลานซ์': { label: 'รีบาลานซ์', color: '#d8a229' },
  };
  const TAG_KEYS = Object.keys(TAGS);
  const PALETTE = ['#60a5fa', '#3fd07f', '#a78bfa', '#d8a229', '#ff8da3', '#22d3ee', '#f97316', '#34d399', '#e879f9', '#facc15'];
  const OPT_COLOR = '#5e6a7d';

  const num = (v, dp = 2) => v == null || isNaN(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const qty = (v) => num(v, v % 1 === 0 ? 0 : 4);
  const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }); };

  function Conf({ n }) {
    return <span className="conf"><b>มั่นใจ</b>{[1,2,3,4,5].map(i => <i key={i} className={i <= (n||0) ? 'on' : ''} />)}</span>;
  }
  function Tag({ k }) {
    const t = TAGS[k]; if (!t) return null;
    return <span className="tagc" style={{ color: t.color, background: t.color + '22', borderColor: t.color + '55' }}><i className="td" style={{ background: t.color }} />{t.label}</span>;
  }

  // premium currently at stake in OPEN options → one allocation slice
  // (uses premium, not strike notional, so cash-secured puts don't dwarf stocks)
  function optionsCapital(trades) {
    return (trades || []).filter(t => (t.assetType || 'option') === 'option' && t.status === 'Opened').reduce((s, t) => {
      const c = Math.abs(t.contracts || 0);
      return s + Math.abs(t.entryPrice || 0) * 100 * c;
    }, 0);
  }

  /* ---------- share to social ---------- */
  // build share text for a whole position OR a single lot transaction
  function buildStockShare({ pos, derived, lot }) {
    const T = window.TL;
    const tk = pos.ticker || '?';
    const m = (v, dp = 2) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    let lines = [];
    if (lot) {
      const isBuy = lot.type === 'buy';
      lines.push(`${isBuy ? '📥 ซื้อ' : '📤 ขาย'} $${tk}`);
      lines.push(`${qty(lot.shares)} หุ้น @ ${m(lot.price)}`);
      if (isBuy) lines.push(`ต้นทุนเฉลี่ย: ${m(lot.avgAfter)}`);
      else if (lot.lotRealized != null) lines.push(`กำไรไม้นี้: ${T.fmtMoneyP(lot.lotRealized, 0)}`);
      if (lot.tag) lines.push(`🏷️ ${lot.tag}`);
      if (lot.note) lines.push(`📝 ${lot.note.slice(0, 70)}${lot.note.length > 70 ? '…' : ''}`);
    } else {
      lines.push(`📊 $${tk} — พอร์ตหุ้น`);
      lines.push(`ถือ ${qty(derived.shares)} หุ้น @ ต้นทุนเฉลี่ย ${m(derived.avg)}`);
      if (derived.mv != null) lines.push(`มูลค่า ${m(derived.mv, 0)} · Unreal ${T.fmtMoneyP(derived.unreal, 0)} (${T.fmtPctP(derived.unrealPct, 1)})`);
      if (derived.realized) lines.push(`Realized: ${T.fmtMoneyP(derived.realized, 0)}`);
    }
    const ht = `\n\n#StockTrading #บันทึกการเทรด $${tk}`;
    const text = lines.join('\n') + ht;
    return { text, url: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}` };
  }

  // visual share card (for copy-as-image)
  function StockShareCard({ pos, derived, lot, cardRef }) {
    const T = window.TL;
    const tk = pos.ticker || '?';
    const isLot = !!lot;
    const isBuy = lot && lot.type === 'buy';
    const accent = isLot ? (isBuy ? 'var(--accent-2)' : 'var(--warn)') : 'var(--accent-2)';
    return (
      <div ref={cardRef} style={{ width: 380, background: 'linear-gradient(160deg,#11151d,#0a0d13)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 22px 18px', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: accent, display: 'grid', placeItems: 'center', fontWeight: 700, color: '#0a0d13', fontSize: 16, fontFamily: 'var(--font-mono)' }}>{tk[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 19, fontFamily: 'var(--font-mono)', letterSpacing: '.3px' }}>${tk}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{pos.name || (isLot ? (isBuy ? 'บันทึกการซื้อ' : 'บันทึกการขาย') : 'พอร์ตหุ้น')}</div>
          </div>
          {isLot && <div style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 999, color: accent, background: isBuy ? 'var(--accent-soft)' : 'var(--warn-soft)', border: '1px solid ' + (isBuy ? 'var(--accent-line)' : 'rgba(216,162,41,.3)') }}>{isBuy ? 'ซื้อ' : 'ขาย'}</div>}
        </div>
        {isLot ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700 }}>{qty(lot.shares)}</span>
              <span style={{ color: 'var(--text-faint)' }}>หุ้น @</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600 }}>${num(lot.price, 2)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: lot.note ? 14 : 4 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{isBuy ? 'ต้นทุนเฉลี่ย' : 'กำไรไม้นี้'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, marginTop: 2, color: isBuy ? 'var(--text)' : (lot.lotRealized >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)') }}>{isBuy ? '$' + num(lot.avgAfter, 2) : T.fmtMoneyP(lot.lotRealized, 0)}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px' }}>มูลค่าไม้นี้</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, marginTop: 2 }}>${num(lot.shares * lot.price, 0)}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700 }}>{qty(derived.shares)}</span>
              <span style={{ color: 'var(--text-faint)' }}>หุ้น @ เฉลี่ย</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }}>${num(derived.avg, 2)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Unrealized</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, marginTop: 2, color: (derived.unreal || 0) >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{derived.unreal != null ? T.fmtMoneyP(derived.unreal, 0) : '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{T.fmtPctP(derived.unrealPct, 1)}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Realized</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, marginTop: 2, color: derived.realized > 0 ? 'var(--pos-bright)' : derived.realized < 0 ? 'var(--neg-bright)' : 'var(--text)' }}>{derived.realized ? T.fmtMoneyP(derived.realized, 0) : '$0'}</div>
              </div>
            </div>
          </>
        )}
        {isLot && lot.note && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.5, borderLeft: '2px solid ' + accent, paddingLeft: 10 }}>{lot.note}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
          <div style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--accent-2)' }}></div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '.3px' }}>Option Trade Log · บันทึกการเทรด</span>
        </div>
      </div>
    );
  }

  function StockShareModal({ pos, derived, lot, onClose }) {
    const { useRef: ur, useState: us } = React;
    const taRef = ur(null), cardRef = ur(null);
    const [copied, setCopied] = us(false);
    const [imgMsg, setImgMsg] = us('');
    const { text, url } = buildStockShare({ pos, derived, lot });

    const copy = () => {
      const done = () => setCopied(true);
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(() => { if (taRef.current) { taRef.current.focus(); taRef.current.select(); try { document.execCommand('copy'); done(); } catch (e) {} } });
      } else if (taRef.current) { taRef.current.focus(); taRef.current.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
    };
    const copyImage = async () => {
      if (!cardRef.current || !window.html2canvas) { setImgMsg('สร้างรูปไม่ได้'); return; }
      setImgMsg('กำลังสร้างรูป…');
      try {
        const canvas = await window.html2canvas(cardRef.current, { backgroundColor: '#0a0d13', scale: 2, logging: false });
        canvas.toBlob(async (blob) => {
          if (!blob) { setImgMsg('สร้างรูปไม่สำเร็จ'); return; }
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            setImgMsg('✓ คัดลอกรูปแล้ว — วางได้เลย');
          } catch (e) {
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `${pos.ticker}_${lot ? lot.type : 'position'}.png`; a.click();
            setImgMsg('✓ ดาวน์โหลดรูปแล้ว');
          }
          setTimeout(() => setImgMsg(''), 2600);
        });
      } catch (e) { setImgMsg('สร้างรูปไม่สำเร็จ'); }
    };

    return (
      <>
        <div className="scrim" style={{ zIndex: 130 }} onClick={onClose} />
        <div className="copy-modal" role="dialog" aria-label="แชร์หุ้น">
          <div className="copy-modal-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600, fontSize: 15 }}>
              <svg width="16" height="16" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"/></svg>
              แชร์{lot ? (lot.type === 'buy' ? 'การซื้อ' : 'การขาย') : 'พอร์ตหุ้น'} <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>· {pos.ticker}</span>
            </div>
            <button className="btn btn-ghost icon-btn" onClick={onClose}><Icon name="close" /></button>
          </div>
          <div className="copy-modal-body" style={{ overflowY: 'auto', maxHeight: '66vh', padding: '14px 14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><StockShareCard pos={pos} derived={derived} lot={lot} cardRef={cardRef} /></div>
            <textarea ref={taRef} className="copy-ta" readOnly value={text} onFocus={e => e.target.select()} style={{ height: 130, marginTop: 12 }} />
          </div>
          <div className="copy-modal-foot">
            <span className="faint" style={{ fontSize: 11.5, flex: 1 }}>{imgMsg || (copied ? 'คัดลอกแล้ว — วางได้เลย' : 'กด Copy / 📸 รูป หรือเปิด X')}</span>
            <button className="btn" onClick={copyImage} title="คัดลอกรูปการ์ด"><Icon name="copy" size={15} />📸 รูป</button>
            <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'คัดลอกแล้ว' : 'Copy'}</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026Z"/></svg>
              เปิด X
            </a>
          </div>
        </div>
      </>
    );
  }

  /* ---------- allocation donut ---------- */
  function Donut({ slices, total, size = 168 }) {
    const C = 2 * Math.PI * ((size - 22) / 2), r = (size - 22) / 2, cx = size / 2;
    const tot = total || slices.reduce((s, x) => s + x.value, 0) || 1;
    let acc = 0;
    return (
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="20" />
          {slices.map((s, i) => {
            const frac = s.value / tot, len = C * frac, off = C * acc; acc += frac;
            return <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth="20"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
              transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: 'stroke-dasharray .5s' }} />;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="num" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1 }}>{window.TL.fmtMoney(tot)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>หุ้น + ออปชั่น</div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- one lot row ---------- */
  function LotRow({ pos, l, onEdit, onDelete, onShare }) {
    return (
      <div className="lot">
        <div className="lot-date">{fmtDate(l.date)}</div>
        <div className={'lot-type ' + l.type}>{l.type === 'buy' ? 'ซื้อ' : 'ขาย'}</div>
        <div className="lot-main">
          <div className="lot-qty">{qty(l.shares)}<span className="x">×</span>${num(l.price, 2)}{l.fee ? <span className="lot-fee">ค่าธ. ${num(l.fee, 2)}</span> : null}</div>
          <div className="lot-meta"><Tag k={l.tag} /><Conf n={l.conf} /></div>
          {l.note && <div className="lot-note">{l.note}</div>}
          {l.chart && <a className="lot-chart" href={l.chart} target="_blank" rel="noopener noreferrer" title="เปิดรูปกราฟที่แนบไว้"><img src={l.chart} alt="chart" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} /><span className="lc-tag">📈 กราฟ</span></a>}
        </div>
        <div className="lot-right">
          {l.type === 'buy'
            ? <div className="faint" style={{ fontSize: 11.5 }}>ต้นทุนเฉลี่ย<br/><span className="num" style={{ color: 'var(--text-dim)', fontSize: 13 }}>${num(l.avgAfter, 2)}</span></div>
            : <div><div className="faint" style={{ fontSize: 11 }}>กำไรไม้นี้</div><div className="lot-realized" style={{ color: l.lotRealized >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{window.TL.fmtMoneyP(l.lotRealized, 0)}</div></div>}
          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm icon-btn" style={{ width: 26, height: 26 }} onClick={() => onShare(l)} title="แชร์ไม้นี้"><Icon name="share" size={13} /></button>
            <button className="btn btn-ghost btn-sm icon-btn" style={{ width: 26, height: 26 }} onClick={() => onEdit(l)} title="แก้ไขไม้"><Icon name="edit" size={13} /></button>
            <button className="btn btn-ghost btn-sm icon-btn" style={{ width: 26, height: 26 }} onClick={() => onDelete(l)} title="ลบไม้"><Icon name="trash" size={13} /></button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- add / edit lot drawer ---------- */
  function LotDrawer({ pos, derived, initial, totalMV, posMV, onClose }) {
    const edit = !!initial;
    const [type, setType] = useState(initial ? initial.type : 'buy');
    const [date, setDate] = useState(initial ? initial.date : new Date().toISOString().slice(0, 10));
    const [shares, setShares] = useState(initial ? String(initial.shares) : '');
    const [price, setPrice] = useState(initial ? String(initial.price) : '');
    const [fee, setFee] = useState(initial && initial.fee ? String(initial.fee) : '');
    const [tag, setTag] = useState(initial ? initial.tag : 'DCA');
    const [conf, setConf] = useState(initial ? (initial.conf || 3) : 3);
    const [note, setNote] = useState(initial ? (initial.note || '') : '');
    const [chart, setChart] = useState(initial ? (initial.chart || '') : '');
    const [target, setTarget] = useState(pos.target != null ? String(pos.target) : '');
    const sh = parseFloat(shares) || 0, pr = parseFloat(price) || 0, fe = parseFloat(fee) || 0;
    const estCost = sh * pr + fe;
    const estRealized = type === 'sell' ? (pr - derived.avg) * sh - fe : null;
    const newAvg = (derived.basis + estCost) / Math.max(1e-9, derived.shares + sh);
    const canSave = sh > 0 && pr > 0 && (type === 'buy' || sh <= derived.shares + 1e-6);
    // allocation math (uses current price if known, else trade price)
    const unit = pos.currentPrice || pr || derived.avg || 0;
    const curPosMV = posMV != null ? posMV : (derived.mv != null ? derived.mv : derived.basis);
    const addMV = (type === 'buy' ? 1 : -1) * sh * unit;
    const newPosMV = Math.max(0, curPosMV + addMV);
    const newTotal = Math.max(1e-9, (totalMV || curPosMV) + addMV);
    const curAlloc = (totalMV ? curPosMV / totalMV : 0) * 100;
    const newAlloc = newPosMV / newTotal * 100;
    const tgt = parseFloat(target);
    const hasTgt = target !== '' && !isNaN(tgt) && tgt > 0;
    const diffNow = hasTgt ? curAlloc - tgt : null;       // + over / - under
    const diffAfter = hasTgt ? newAlloc - tgt : null;
    // $ needed to reach target at current total
    const moneyToTarget = hasTgt ? (tgt / 100) * (totalMV || curPosMV) - curPosMV : null;
    const sharesToTarget = hasTgt && unit ? moneyToTarget / unit : null;
    const quickNotes = type === 'buy'
      ? ['ถัวเฉลี่ยขาลง', 'DCA ตามแผน', 'ย่อแรงเลยเก็บเพิ่ม', 'งบดีกว่าคาด']
      : ['ล็อกกำไรบางส่วน', 'ตัดขาดทุนตามแผน', 'รีบาลานซ์พอร์ต', 'ผิดสมมติฐาน'];

    const save = () => {
      const lot = { date, type, shares: sh, price: pr, fee: fe, tag, conf, note: note.trim(), chart: chart.trim() || null };
      // persist target if changed
      const tval = target === '' ? null : (isNaN(parseFloat(target)) ? null : parseFloat(target));
      if (tval !== (pos.target != null ? pos.target : null)) window.Store.updatePosition(pos.id, { target: tval });
      if (edit) window.Store.updateLot(pos.id, initial.id, lot);
      else window.Store.addLot(pos.id, lot);
      onClose();
    };

    return (
      <>
        <div className="scrim" onClick={onClose} />
        <div className="drawer" style={{ width: 460 }}>
          <div className="drawer-head">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{edit ? 'แก้ไขไม้' : (type === 'buy' ? 'ซื้อเพิ่ม' : 'ขาย (ทยอย)')} · {pos.ticker}</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>ถืออยู่ {qty(derived.shares)} หุ้น · ต้นทุนเฉลี่ย ${num(derived.avg, 2)}</div>
            </div>
            <button className="btn btn-ghost icon-btn" onClick={onClose}><Icon name="close" /></button>
          </div>
          <div className="drawer-body">
            <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
              <button className={type === 'buy' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setType('buy')}>ซื้อ</button>
              <button className={type === 'sell' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setType('sell')}>ขาย</button>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 13 }}>
              <div className="field"><label>วันที่</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="field"><label>จำนวนหุ้น</label><input className="input num" inputMode="decimal" placeholder="0" value={shares} onChange={e => setShares(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
              <div className="field"><label>ราคา / หุ้น</label><input className="input num" inputMode="decimal" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
              <div className="field"><label>ค่าธรรมเนียม <span className="hint">($)</span></label><input className="input num" inputMode="decimal" placeholder="0.00" value={fee} onChange={e => setFee(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            </div>

            {sh > 0 && pr > 0 && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, marginTop: 14, padding: '11px 14px' }}>
                <div className="kv" style={{ padding: '3px 0' }}><span className="k">{type === 'buy' ? 'มูลค่าซื้อรวม' : 'มูลค่าขายรวม'}</span><span className="v">{window.TL.fmtMoney(estCost, 2)}</span></div>
                {type === 'buy' ? <>
                  <div className="kv" style={{ padding: '3px 0' }}><span className="k">หุ้นรวมหลังซื้อ</span><span className="v">{qty(derived.shares + sh)} หุ้น</span></div>
                  <div className="kv" style={{ padding: '3px 0' }}><span className="k">ต้นทุนเฉลี่ยเดิม</span><span className="v" style={{ color: 'var(--text-dim)' }}>${num(derived.avg, 2)}</span></div>
                  <div className="kv" style={{ padding: '6px 0', borderBottom: 'none', alignItems: 'center' }}>
                    <span className="k" style={{ fontWeight: 600, color: 'var(--text)' }}>ต้นทุนเฉลี่ยใหม่</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="v num" style={{ fontSize: 18, color: 'var(--accent-2)' }}>${num(newAvg, 2)}</span>
                      {derived.shares > 0 && Math.abs(newAvg - derived.avg) > 0.005 && (
                        <span className="num" style={{ fontSize: 11.5, fontWeight: 600, color: newAvg < derived.avg ? 'var(--pos-bright)' : 'var(--text-dim)' }}>
                          {newAvg < derived.avg ? '▼ ถัวลง' : '▲ ถัวขึ้น'} ${num(Math.abs(newAvg - derived.avg), 2)}
                        </span>
                      )}
                    </span>
                  </div>
                </> : <div className="kv" style={{ padding: '3px 0', borderBottom: 'none' }}><span className="k">กำไร/ขาดทุนไม้นี้</span><span className="v" style={{ color: estRealized >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{window.TL.fmtMoneyP(estRealized, 2)}</span></div>}
              </div>
            )}
            {type === 'sell' && sh > derived.shares + 1e-6 && <div style={{ color: 'var(--neg-bright)', fontSize: 12, marginTop: 8 }}>ขายเกินจำนวนที่ถือ ({qty(derived.shares)} หุ้น)</div>}

            {/* target allocation — intended portfolio weight + over/under */}
            <div className="field" style={{ marginTop: 16 }}>
              <label>สัดส่วนที่ตั้งใจถือ <span className="hint">(% ของพอร์ตรวม — ไม่บังคับ)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input className="input num" inputMode="decimal" placeholder="เช่น 15" value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 110 }} />
                <span className="faint" style={{ fontSize: 18, fontWeight: 600 }}>%</span>
                {hasTgt && <span className="faint" style={{ fontSize: 12 }}>≈ {window.TL.fmtMoney((tgt / 100) * (totalMV || curPosMV), 0)} ของพอร์ต</span>}
              </div>
              {hasTgt && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, marginTop: 10, padding: '11px 14px' }}>
                  <div className="kv" style={{ padding: '3px 0' }}>
                    <span className="k">สัดส่วนปัจจุบัน</span>
                    <span className="v num">{curAlloc.toFixed(1)}% <span className="faint" style={{ fontWeight: 400 }}>/ เป้า {tgt}%</span></span>
                  </div>
                  {sh > 0 && pr > 0 && (
                    <div className="kv" style={{ padding: '3px 0' }}>
                      <span className="k">หลัง{type === 'buy' ? 'ซื้อ' : 'ขาย'}ไม้นี้</span>
                      <span className="v num" style={{ color: 'var(--accent-2)' }}>{newAlloc.toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="kv" style={{ padding: '6px 0 3px', borderBottom: 'none', alignItems: 'center' }}>
                    <span className="k" style={{ fontWeight: 600, color: 'var(--text)' }}>{(sh > 0 && pr > 0) ? 'ส่วนต่างหลังทำรายการ' : 'ส่วนต่างจากเป้า'}</span>
                    {(() => {
                      const d = (sh > 0 && pr > 0) ? diffAfter : diffNow;
                      const over = d >= 0;
                      return <span className="num" style={{ fontWeight: 700, fontSize: 15, color: Math.abs(d) < 0.5 ? 'var(--pos-bright)' : over ? 'var(--warn)' : 'var(--text-dim)' }}>
                        {Math.abs(d) < 0.5 ? '✓ ตรงเป้า' : over ? `เกินเป้า ${d.toFixed(1)}%` : `ขาดอีก ${Math.abs(d).toFixed(1)}%`}
                      </span>;
                    })()}
                  </div>
                  {diffNow < -0.5 && moneyToTarget > 0 && (
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                      ต้องซื้อเพิ่ม ~{window.TL.fmtMoney(moneyToTarget, 0)}{sharesToTarget > 0 ? ` (~${qty(Math.round(sharesToTarget))} หุ้น)` : ''} ถึงจะถึงเป้า
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label>หมวด / แท็ก</label>
              <div className="tag-pick">{TAG_KEYS.map(k => <span key={k} className={'tag-opt' + (tag === k ? ' on' : '')} onClick={() => setTag(k)}><Tag k={k} /></span>)}</div>
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label>เหตุผล / โน้ต</label>
              <textarea className="input" placeholder="ทำไมถึงซื้อ/ขายไม้นี้…" value={note} onChange={e => setNote(e.target.value)} />
              <div className="pill-row" style={{ marginTop: 8 }}>{quickNotes.map(q => <span key={q} className="note-tag" onClick={() => setNote(n => n ? n + ' · ' + q : q)}>{q}</span>)}</div>
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label>ความมั่นใจ</label>
              <div className="conf-pick">{[1,2,3,4,5].map(i => <b key={i} className={i <= conf ? 'on' : ''} onClick={() => setConf(i)}>{i}</b>)}</div>
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label>ลิงก์รูปกราฟ <span className="hint">(วาง URL รูป — ไม่บังคับ)</span></label>
              <input className="input" placeholder="https://…/chart.png" value={chart} onChange={e => setChart(e.target.value)} />
            </div>
          </div>
          <div className="drawer-foot">
            <button className="btn" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={!canSave} style={!canSave ? { opacity: .5, cursor: 'not-allowed' } : null} onClick={save}><Icon name="check" size={15} />{edit ? 'บันทึกการแก้ไข' : 'บันทึกไม้นี้'}</button>
          </div>
        </div>
      </>
    );
  }

  /* ---------- add position drawer ---------- */
  function AddPositionDrawer({ onClose }) {
    const [ticker, setTicker] = useState('');
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const save = () => {
      const tk = ticker.toUpperCase().trim(); if (!tk) return;
      window.Store.addPosition({ ticker: tk, name: name.trim(), currentPrice: parseFloat(price) || null, lots: [] });
      onClose(tk);
    };
    return (
      <>
        <div className="scrim" onClick={() => onClose()} />
        <div className="drawer" style={{ width: 420 }}>
          <div className="drawer-head"><div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>เพิ่มหุ้นตัวใหม่</div><button className="btn btn-ghost icon-btn" onClick={() => onClose()}><Icon name="close" /></button></div>
          <div className="drawer-body">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 13 }}>
              <Field label="Ticker"><input className="input input-mono" style={{ textTransform: 'uppercase' }} placeholder="AAPL" value={ticker} onChange={e => setTicker(e.target.value)} /></Field>
              <Field label="ราคาปัจจุบัน" hint="ไม่บังคับ"><NumInput value={price ? parseFloat(price) : null} onChange={v => setPrice(v == null ? '' : String(v))} placeholder="ดึงอัตโนมัติได้" /></Field>
              <Field label="ชื่อบริษัท" span><input className="input" placeholder="Apple Inc." value={name} onChange={e => setName(e.target.value)} /></Field>
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 14 }}>สร้างหุ้นแล้วค่อยกด "ซื้อเพิ่ม" เพื่อบันทึกไม้แรก — ต้นทุนเฉลี่ยจะคำนวณให้เอง</div>
          </div>
          <div className="drawer-foot"><button className="btn" onClick={() => onClose()}>ยกเลิก</button><button className="btn btn-primary" disabled={!ticker.trim()} onClick={save}><Icon name="check" size={15} />สร้างหุ้น</button></div>
        </div>
      </>
    );
  }

  /* ============================================================ */
  function StocksPage() {
    const state = window.useStore();
    const T = window.TL;
    const [open, setOpen] = useState(null);
    const [lotDrawer, setLotDrawer] = useState(null);  // { pos, derived, initial? }
    const [addPos, setAddPos] = useState(false);
    const [confirmPos, setConfirmPos] = useState(null);
    const [confirmLot, setConfirmLot] = useState(null);  // { posId, lot }
    const [shareItem, setShareItem] = useState(null);  // { pos, derived, lot? }
    const [refreshing, setRefreshing] = useState(false);
    const [refreshErr, setRefreshErr] = useState(null);

    const positions = state.positions || [];
    const sum = useMemo(() => T.positionsSummary(positions), [positions]);
    const rows = sum.rows.filter(r => r.shares > 1e-6 || r.realized);
    const optCap = useMemo(() => optionsCapital(state.trades), [state.trades]);
    const totalMV = sum.mv + optCap;

    const slices = [...sum.held.map((r, i) => ({ name: r.ticker, value: r.mv != null ? r.mv : r.basis, color: PALETTE[positions.findIndex(p => p.id === r.id) % PALETTE.length] })),
      ...(optCap > 0 ? [{ name: 'Options', value: optCap, color: OPT_COLOR }] : [])].sort((a, b) => b.value - a.value);
    const colorOf = (r) => PALETTE[positions.findIndex(p => p.id === r.id) % PALETTE.length];

    const refreshPrices = async () => {
      const held = rows.filter(r => r.shares > 1e-6);
      if (!held.length) return;
      setRefreshing(true); setRefreshErr(null);
      try {
        await Promise.all(held.map(async r => {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${r.ticker}&token=${FINNHUB_KEY}`);
          const d = await res.json();
          if (d && d.c && d.c > 0) window.Store.updatePosition(r.id, { currentPrice: d.c });
        }));
      } catch (e) { setRefreshErr('โหลดราคาไม่ได้ ลองใหม่'); }
      setRefreshing(false);
    };

    const stat = (l, v, s, cls) => (
      <div className="sumstat" style={{ minWidth: 130 }}>
        <div className="l">{l}</div>
        <div className={'v num ' + (cls || '')}>{v}</div>
        {s && <div className="s">{s}</div>}
      </div>
    );

    return (
      <div className="content">
        {/* KPI band */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 18 }}>
          {window.KPI({ label: 'หุ้นที่ถือ', icon: 'coins', value: sum.held.length, sub: <span className="faint">{rows.length} ตัวมีประวัติ</span> })}
          {window.KPI({ label: 'มูลค่าหุ้น', icon: 'wallet', value: T.fmtMoney(sum.mv), sub: <span className="faint">ต้นทุน {T.fmtMoney(sum.cost)}</span> })}
          {window.KPI({ label: 'Unrealized', icon: 'pulse', accent: true, value: <window.PL value={sum.unreal} dp={0} />, sub: <span className="faint">{T.fmtPctP(sum.unrealPct, 1)}</span> })}
          {window.KPI({ label: 'Realized (สะสม)', icon: 'flame', value: <window.PL value={sum.realized} dp={0} />, sub: <span className="faint">จากการทยอยขาย</span> })}
        </div>

        {/* allocation */}
        <Card className="alloc-card" style={{ marginBottom: 18, padding: '18px 20px', display: 'flex', gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
          <Donut slices={slices} total={totalMV} />
          <div className="alloc-legend">
            <div className="section-label" style={{ margin: '0 6px 6px' }}>สัดส่วนพอร์ต {optCap > 0 ? '(รวม Options)' : ''}</div>
            {slices.length ? slices.map(s => (
              <div className="leg-row" key={s.name}>
                <span className="leg-dot" style={{ background: s.color }} />
                <span className="leg-name">{s.name}{s.name === 'Options' && <small>พรีเมียมเปิดอยู่</small>}</span>
                <span className="leg-pct">{(s.value / totalMV * 100).toFixed(1)}%</span>
                <span className="leg-val">{T.fmtMoney(s.value)}</span>
              </div>
            )) : <div className="faint" style={{ padding: 8, fontSize: 13 }}>ยังไม่มีหุ้น — กด "เพิ่มหุ้น"</div>}
          </div>
        </Card>

        {/* summary + actions */}
        <Card style={{ marginBottom: 18, padding: '16px 20px', display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
          {stat('ต้นทุนหุ้นรวม', T.fmtMoney(sum.cost))}
          {stat('มูลค่าหุ้นปัจจุบัน', T.fmtMoney(sum.mv))}
          {stat('Unrealized P/L', T.fmtMoneyP(sum.unreal), T.fmtPctP(sum.unrealPct, 1), sum.unreal >= 0 ? 'pos' : 'neg')}
          {stat('Realized P/L', T.fmtMoneyP(sum.realized), 'ทยอยขาย', sum.realized >= 0 ? 'pos' : 'neg')}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {refreshErr && <span className="faint" style={{ fontSize: 12, color: 'var(--neg-bright)' }}>{refreshErr}</span>}
            <button className="btn btn-sm" onClick={refreshPrices} disabled={refreshing} style={refreshing ? { opacity: .6 } : null}><Icon name="reset" size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : null} />{refreshing ? 'กำลังโหลด…' : '🔄 อัปเดตราคา'}</button>
            <button className="btn btn-primary btn-sm" onClick={() => setAddPos(true)}><Icon name="plus" size={14} />เพิ่มหุ้น</button>
          </div>
        </Card>

        {/* allocation planning — target split incl Options (sums to 100%) */}
        {(() => {
          const optTarget = state.portfolio && state.portfolio.optionsTarget != null ? state.portfolio.optionsTarget : null;
          const sumStockTargets = sum.held.reduce((s, r) => s + (r.target || 0), 0);
          const totalTarget = sumStockTargets + (optTarget || 0);
          const remaining = 100 - totalTarget;
          const hasAnyTarget = (optTarget || 0) > 0 || sumStockTargets > 0;
          const onHundred = Math.abs(remaining) < 0.5;
          const fmtT = v => num(v, v % 1 === 0 ? 0 : 1);
          return (
            <Card style={{ marginBottom: 18, padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: hasAnyTarget ? 13 : 0 }}>
                <div className="section-label" style={{ margin: 0 }}>แผนแบ่งเงิน <span className="faint" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>เป้าหมาย %</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="leg-dot" style={{ background: OPT_COLOR }} />
                  <span className="faint" style={{ fontSize: 12.5 }}>เทรด Options</span>
                  <window.EditNum value={optTarget} suffix="%" fmt={fmtT} onSave={v => window.Store.updatePortfolio({ optionsTarget: v })} />
                  <span className="faint" style={{ fontSize: 11 }}>(ไม่เทรดเว้นว่างได้)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="faint" style={{ fontSize: 12.5 }}>หุ้นรวม (เป้า)</span>
                  <span className="num" style={{ fontWeight: 600 }}>{fmtT(sumStockTargets)}%</span>
                </div>
                {hasAnyTarget && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 9 }}>
                    <span className="faint" style={{ fontSize: 12 }}>รวมเป้า</span>
                    <span className="num" style={{ fontWeight: 700, fontSize: 16, color: onHundred ? 'var(--pos-bright)' : totalTarget > 100 ? 'var(--neg-bright)' : 'var(--text)' }}>{fmtT(totalTarget)}%</span>
                    <span className="num" style={{ fontSize: 12, fontWeight: 600, color: onHundred ? 'var(--pos-bright)' : totalTarget > 100 ? 'var(--neg-bright)' : 'var(--text-faint)' }}>
                      {onHundred ? '✓ ครบ 100%' : remaining > 0 ? `เหลือ ${fmtT(remaining)}%` : `เกิน ${fmtT(-remaining)}%`}
                    </span>
                  </div>
                )}
              </div>
              {hasAnyTarget && (
                <>
                  <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--surface-3)' }}>
                    {optTarget > 0 && <div title={'Options ' + fmtT(optTarget) + '%'} style={{ width: optTarget + '%', background: OPT_COLOR, flex: 'none' }} />}
                    {sum.held.filter(r => r.target > 0).sort((a, b) => b.target - a.target).map(r => (
                      <div key={r.id} title={r.ticker + ' ' + fmtT(r.target) + '%'} style={{ width: r.target + '%', background: colorOf(r), flex: 'none', borderLeft: '1px solid var(--surface)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 9 }}>
                    {optTarget > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}><span className="leg-dot" style={{ background: OPT_COLOR }} />Options <b className="num" style={{ fontWeight: 600 }}>{fmtT(optTarget)}%</b></span>}
                    {sum.held.filter(r => r.target > 0).sort((a, b) => b.target - a.target).map(r => (
                      <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}><span className="leg-dot" style={{ background: colorOf(r) }} />{r.ticker} <b className="num" style={{ fontWeight: 600 }}>{fmtT(r.target)}%</b></span>
                    ))}
                    {remaining > 0.5 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-faint)' }}><span className="leg-dot" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} />ยังไม่จัดสรร / เงินสด <b className="num" style={{ fontWeight: 600 }}>{fmtT(remaining)}%</b></span>}
                  </div>
                </>
              )}
            </Card>
          );
        })()}

        {/* ledger table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>หุ้น</th>
                  <th className="r">คงเหลือ</th>
                  <th className="r">ต้นทุนเฉลี่ย</th>
                  <th className="r">ราคาล่าสุด</th>
                  <th className="r">มูลค่า</th>
                  <th>สัดส่วน</th>
                  <th className="r">เป้า / ส่วนต่าง</th>
                  <th className="r">Unreal. P/L</th>
                  <th className="r">Realized</th>
                  <th className="c no-sort"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isOpen = open === r.id;
                  const allocPct = totalMV ? (r.mv != null ? r.mv : r.basis) / totalMV : 0;
                  const c = colorOf(r);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={'exp-row' + (isOpen ? ' open' : '')} onClick={() => setOpen(isOpen ? null : r.id)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span className="exp-chev"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>
                            <div><span className="tkr">{r.ticker}</span><div className="faint" style={{ fontSize: 11.5 }}>{r.name || '—'}</div></div>
                          </div>
                        </td>
                        <td className="r num">{qty(r.shares)}</td>
                        <td className="r num muted">${num(r.avg, 2)}</td>
                        <td className="r"><window.EditNum value={r.currentPrice} fmt={v => '$' + num(v, 2)} onSave={v => window.Store.updatePosition(r.id, { currentPrice: v })} /></td>
                        <td className="r num">{r.mv != null ? T.fmtMoney(r.mv) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="alloc-bar" style={{ width: 56 }}><i style={{ width: Math.min(100, allocPct * 250) + '%', background: c }} /></div>
                            <span className="num muted" style={{ fontSize: 12 }}>{(allocPct * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="r" onClick={e => e.stopPropagation()}>
                          <window.EditNum value={r.target != null ? r.target : null} suffix="%" fmt={v => num(v, v % 1 === 0 ? 0 : 1)} onSave={v => window.Store.updatePosition(r.id, { target: v })} />
                          {r.target != null && r.target > 0 && (() => {
                            const d = allocPct * 100 - r.target;
                            const onTgt = Math.abs(d) < 0.5;
                            return <div className="num" style={{ fontSize: 10.5, marginTop: 2, fontWeight: 600, color: onTgt ? 'var(--pos-bright)' : d > 0 ? 'var(--warn)' : 'var(--text-faint)' }}>{onTgt ? '✓ ตรงเป้า' : d > 0 ? `เกิน ${d.toFixed(1)}%` : `ขาด ${Math.abs(d).toFixed(1)}%`}</div>;
                          })()}
                        </td>
                        <td className="r">{r.unreal != null ? <><span className="num" style={{ color: r.unreal >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{T.fmtMoneyP(r.unreal)}</span><div className="num faint" style={{ fontSize: 11 }}>{T.fmtPctP(r.unrealPct, 1)}</div></> : '—'}</td>
                        <td className="r"><span className="num" style={{ color: r.realized > 0 ? 'var(--pos-bright)' : r.realized < 0 ? 'var(--neg-bright)' : 'var(--text-faint)' }}>{r.realized ? T.fmtMoneyP(r.realized) : '—'}</span></td>
                        <td className="c"><button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setLotDrawer({ pos: positions.find(p => p.id === r.id), derived: r }); }}><Icon name="plus" size={13} />ไม้</button></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} style={{ padding: 0 }} className="lotbox">
                            <div className="lotbox-inner">
                              <div className="lotbox-head">
                                <div className="section-label" style={{ margin: 0 }}>ประวัติการซื้อ-ขาย ({r.lots.length} ไม้)</div>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                  <button className="btn btn-sm" onClick={() => setShareItem({ pos: positions.find(p => p.id === r.id), derived: r })} title="แชร์สรุปหุ้นตัวนี้"><Icon name="share" size={14} />แชร์</button>
                                  <button className="btn btn-sm" onClick={() => setLotDrawer({ pos: positions.find(p => p.id === r.id), derived: r })}><Icon name="plus" size={13} />ซื้อ/ขาย</button>
                                  <button className="btn btn-sm btn-ghost" onClick={() => setConfirmPos(r)} title="ลบหุ้นตัวนี้ทั้งหมด"><Icon name="trash" size={13} /></button>
                                </div>
                              </div>
                              {r.lots.length
                                ? r.lots.map(l => <LotRow key={l.id} pos={r} l={l}
                                    onEdit={lot => setLotDrawer({ pos: positions.find(p => p.id === r.id), derived: r, initial: lot })}
                                    onDelete={lot => setConfirmLot({ posId: r.id, lot })}
                                    onShare={lot => setShareItem({ pos: positions.find(p => p.id === r.id), derived: r, lot })} />)
                                : <div className="faint" style={{ padding: '14px 0', fontSize: 13 }}>ยังไม่มีไม้ — กด "ซื้อ/ขาย" เพื่อบันทึกไม้แรก</div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!rows.length && <tr><td colSpan={10}><div className="empty">ยังไม่มีหุ้นในบัญชีรายไม้ — กด "เพิ่มหุ้น" เพื่อเริ่ม</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {lotDrawer && <LotDrawer pos={lotDrawer.pos} derived={lotDrawer.derived} initial={lotDrawer.initial} totalMV={totalMV} posMV={lotDrawer.derived.mv != null ? lotDrawer.derived.mv : lotDrawer.derived.basis} onClose={() => setLotDrawer(null)} />}
        {shareItem && <StockShareModal pos={shareItem.pos} derived={shareItem.derived} lot={shareItem.lot} onClose={() => setShareItem(null)} />}
        {addPos && <AddPositionDrawer onClose={(tk) => { setAddPos(false); if (tk) { const np = (state.positions || []).find(p => p.ticker === tk); } }} />}
        <Confirm open={!!confirmPos} onClose={() => setConfirmPos(null)} danger
          title="ลบหุ้นตัวนี้?" body={confirmPos && (confirmPos.ticker + ' — ลบทุกไม้และประวัติ ย้อนกลับไม่ได้')}
          onConfirm={() => { window.Store.deletePosition(confirmPos.id); setConfirmPos(null); }} />
        <Confirm open={!!confirmLot} onClose={() => setConfirmLot(null)} danger
          title="ลบไม้นี้?" body={confirmLot && ((confirmLot.lot.type === 'buy' ? 'ซื้อ ' : 'ขาย ') + qty(confirmLot.lot.shares) + ' @ $' + num(confirmLot.lot.price, 2))}
          onConfirm={() => { window.Store.deleteLot(confirmLot.posId, confirmLot.lot.id); setConfirmLot(null); }} />
      </div>
    );
  }

  window.StocksPage = StocksPage;
})();
