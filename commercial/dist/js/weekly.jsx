/* ============================================================
   weekly.jsx — Weekly review + LEAP tracker (editable prices).
   Exports window.WeeklyPage
   ============================================================ */
(function () {
  const { useState, useMemo } = React;
  const { Icon, Card, PL, StatusBadge, ResultBadge, EditNum } = window;

  function startOfWeek(d) {
    const dt = new Date(d + 'T00:00:00Z');
    const day = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - day);
    return dt.toISOString().slice(0, 10);
  }
  function addDays(d, n) { const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }

  function formatWeeklySummary(d) {
    const T = window.TL;
    const { wkStart, wkEnd, weekNo, closedThis, openedThis, rolledThis, wins, losses, weekPL, exLeap, nlvStart, nlvEnd, wkChange, wkChangePct, mtd, ytd, leaps, leapCalc, ym, yr } = d;
    const leapTot = leaps.reduce((a, l) => { const c = leapCalc(l); a.cost += c.cost; a.cur += (c.curVal || 0); a.upl += (c.upl || 0); a.wow += (c.wow || 0); return a; }, { cost: 0, cur: 0, upl: 0, wow: 0 });
    const state = window.Store.get();
    const openTrades = state.trades.filter(t => t.status === 'Opened');

    const EN = (window.OZL_LANG || 'th') === 'en';
    const LB = EN ? {
      week: 'Week', startWk: 'Start of week', endWk: 'End of week  ', change: 'Change       ',
      allStrat: 'All strategies', exLeap: 'Excl. LEAP    ', opened: 'Opened', closed: 'Closed',
      plTotal: 'Total P/L', avgTrade: 'Avg / trade', closedHdr: '🎯 Trades closed this week',
      openedHdr: '🔓 Trades opened this week', totalCost: 'Total cost   ', curVal: 'Current value',
      wow: 'WoW change   ', coach: '📌 Please review this week as a trading coach:',
      c1: '1. P/L and NLV overview', c2: '2. What went well — good trades, good discipline',
      c3: '3. What to improve — trades to watch', c4: '4. LEAP review — WoW and unrealized',
      c5: '5. Plan for next week', answer: '(Answer in English; trading terms may stay in English)'
    } : {
      week: 'สัปดาห์ที่', startWk: 'ต้นสัปดาห์ ', endWk: 'ปลายสัปดาห์', change: 'เปลี่ยนแปลง',
      allStrat: 'รวมทุก strategy ', exLeap: 'ไม่รวม LEAP     ', opened: 'เปิดใหม่ ', closed: 'ปิด     ',
      plTotal: 'P/L รวม  ', avgTrade: 'เฉลี่ย/เทรด', closedHdr: '🎯 เทรดที่ปิดสัปดาห์นี้',
      openedHdr: '🔓 เทรดที่เปิดสัปดาห์นี้', totalCost: 'ต้นทุนรวม   ', curVal: 'มูลค่าปัจจุบัน',
      wow: 'WoW เปลี่ยน  ', coach: '📌 กรุณาวิเคราะห์สัปดาห์นี้ในฐานะ trading coach:',
      c1: '1. ภาพรวม P/L และ NLV', c2: '2. จุดดี — เทรดที่ดี discipline ที่ดี',
      c3: '3. จุดปรับปรุง — เทรดที่น่ากังวล', c4: '4. LEAP review — WoW และ unrealized',
      c5: '5. แนวทางสัปดาห์หน้า', answer: '(ตอบเป็นภาษาไทย ผสม trading terms ภาษาอังกฤษ)'
    };

    let txt = '';
    txt += `📊 WEEKLY OPTION LOG — ${LB.week} ${weekNo}\n`;
    txt += `📅 ${T.fmtDate(wkStart)} – ${T.fmtDate(wkEnd)}\n`;
    txt += `${'─'.repeat(48)}\n\n`;

    txt += `💰 NLV SNAPSHOT\n`;
    txt += `  ${LB.startWk}: ${nlvStart != null ? T.fmtMoney(nlvStart) : '—'}\n`;
    txt += `  ${LB.endWk}: ${nlvEnd != null ? T.fmtMoney(nlvEnd) : '—'}\n`;
    txt += `  ${LB.change}: ${wkChange != null ? T.fmtMoneyP(wkChange) + ' (' + T.fmtPctP(wkChangePct, 2) + ')' : '—'}\n\n`;

    txt += `📈 PREMIUMS THIS WEEK\n`;
    txt += `  ${LB.allStrat} : ${T.fmtMoneyP(weekPL)}\n`;
    txt += `  ${LB.exLeap}: ${T.fmtMoneyP(exLeap)}\n`;
    txt += `  MTD (${ym})     : ${T.fmtMoneyP(mtd)}\n`;
    txt += `  YTD (${yr})       : ${T.fmtMoneyP(ytd)}\n\n`;

    txt += `📝 TRADE ACTIVITY\n`;
    txt += `  ${LB.opened}  : ${openedThis.length} trades\n`;
    txt += `  ${LB.closed}  : ${closedThis.length} trades  (Win: ${wins.length} / Loss: ${losses.length})\n`;
    txt += `  Rolled    : ${rolledThis.length} trades\n`;
    txt += `  Win Rate  : ${T.fmtPct(wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0, 0)}\n`;
    txt += `  ${LB.plTotal} : ${T.fmtMoneyP(weekPL)}\n`;
    txt += `  ${LB.avgTrade}: ${T.fmtMoneyP(closedThis.length ? weekPL / closedThis.length : 0)}\n\n`;

    if (closedThis.length) {
      txt += `${LB.closedHdr}\n`;
      for (const t of closedThis) {
        txt += `  ${t.ticker} | ${t.strategy} | P/L: ${T.fmtMoneyP(t.pl || 0)} | ${t.result || '—'}`;
        if (t.closeNote) txt += ` | ${t.closeNote.slice(0, 80)}`;
        txt += '\n';
      }
      txt += '\n';
    }

    if (openedThis.length) {
      txt += `${LB.openedHdr}\n`;
      for (const t of openedThis) {
        txt += `  ${t.ticker} | ${t.strategy} | Strike: ${t.strike || '—'} | Expiry: ${T.fmtDate(t.expiry)}`;
        if (t.openNote) txt += ` | ${t.openNote.slice(0, 80)}`;
        txt += '\n';
      }
      txt += '\n';
    }

    if (openTrades.length) {
      txt += `📂 OPEN POSITIONS (${openTrades.length})\n`;
      for (const t of openTrades) {
        txt += `  ${t.ticker} | ${t.strategy} | Strike: ${t.strike || '—'} | Expiry: ${T.fmtDate(t.expiry)}\n`;
      }
      txt += '\n';
    }

    txt += `🚀 LEAP TRACKER (${leaps.length} positions)\n`;
    txt += `  ${LB.totalCost}: ${T.fmtMoney(leapTot.cost)}\n`;
    txt += `  ${LB.curVal}: ${T.fmtMoney(leapTot.cur)}\n`;
    txt += `  Unrealized P/L: ${T.fmtMoneyP(leapTot.upl)} (${leapTot.cost ? T.fmtPctP(leapTot.upl / leapTot.cost, 1) : '—'})\n`;
    txt += `  ${LB.wow}: ${T.fmtMoneyP(leapTot.wow)}\n`;
    for (const l of leaps) {
      const c = leapCalc(l);
      txt += `  ${l.ticker} Strike${l.strike} | Cur: ${l.currentPrice != null ? T.fmtNum(l.currentPrice, 2) : '—'} | UPL: ${c.upl != null ? T.fmtMoneyP(c.upl) : '—'} | WoW: ${c.wow != null ? T.fmtMoneyP(c.wow) : '—'}\n`;
    }
    txt += '\n';

    txt += `${'─'.repeat(48)}\n`;
    txt += `${LB.coach}\n`;
    txt += `  ${LB.c1}\n`;
    txt += `  ${LB.c2}\n`;
    txt += `  ${LB.c3}\n`;
    txt += `  ${LB.c4}\n`;
    txt += `  ${LB.c5}\n`;
    txt += `${LB.answer}\n`;
    return txt;
  }

  function WeeklyPage({ accent }) {
    const state = window.useStore();
    const T = window.TL;

    // default week = week of latest NLV / trade date
    const latestDate = useMemo(() => {
      const ds = [...state.daily.map(d => d.date), ...state.trades.map(t => t.closeDate || t.date)].filter(Boolean).sort();
      return ds[ds.length - 1] || new Date().toISOString().slice(0, 10);
    }, [state.daily, state.trades]);
    const [wkStart, setWkStart] = useState(() => startOfWeek(latestDate));
    const wkEnd = addDays(wkStart, 6);
    const weekNo = T.isoWeek(wkStart);

    const inWeek = (d) => d && d >= wkStart && d <= wkEnd;
    const closedThis = state.trades.filter(t => T.isRealized(t) && inWeek(t.closeDate));
    const openedThis = state.trades.filter(t => inWeek(t.date) && t.status !== 'Pair');
    const rolledThis = state.trades.filter(t => t.status === 'Rolled' && inWeek(t.closeDate));
    const wins = closedThis.filter(t => t.result === 'Win'), losses = closedThis.filter(t => t.result === 'Loss');
    const weekPL = closedThis.reduce((s, t) => s + (t.pl || 0), 0);
    const exLeap = closedThis.filter(t => !T.isLeap(t)).reduce((s, t) => s + (t.pl || 0), 0);

    // NLV snapshot
    const nlvSorted = state.daily.slice().filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date));
    const nlvAtOrBefore = (d) => { let v = null; for (const r of nlvSorted) { if (r.date <= d) v = r; else break; } return v; };
    const nlvInWeek = nlvSorted.filter(r => inWeek(r.date));
    const nlvStart = (nlvInWeek[0] || nlvAtOrBefore(wkStart) || {}).nlv;
    const nlvEnd = (nlvInWeek[nlvInWeek.length - 1] || nlvAtOrBefore(wkEnd) || {}).nlv;
    const wkChange = (nlvStart != null && nlvEnd != null) ? nlvEnd - nlvStart : null;
    const wkChangePct = (wkChange != null && nlvStart) ? wkChange / nlvStart : null;

    // MTD / YTD premium (closed, ex-leap and all)
    const ym = wkEnd.slice(0, 7), yr = wkEnd.slice(0, 4);
    const mtd = state.trades.filter(t => T.isRealized(t) && (t.closeDate || '').slice(0, 7) === ym).reduce((s, t) => s + (t.pl || 0), 0);
    const ytd = state.trades.filter(t => T.isRealized(t) && (t.closeDate || '').slice(0, 4) === yr).reduce((s, t) => s + (t.pl || 0), 0);

    // LEAP tracker — auto-synced จากเทรด "Buy Call (Leap)" ที่เปิดอยู่ + รายการ manual เก่า
    const leapKey = x => [x.ticker, x.strike != null ? x.strike : '', x.expiry || ''].join('|');
    const manualByKey = {};
    state.leaps.forEach(l => { manualByKey[leapKey(l)] = l; });
    const tradeLeapRows = state.trades.filter(t => T.isLeap(t) && t.status === 'Opened').map(t => {
      const m = manualByKey[leapKey(t)] || {};   // ราคาเดิมจาก manual leap ตัวเดียวกัน (ถ้ามี) — ยกมาแสดงต่อ ไม่ต้องกรอกใหม่
      return {
        id: 'T' + t.id, tradeId: t.id, fromTrade: true,
        ticker: t.ticker, strike: t.strike, entryPrice: t.entryPrice,
        contracts: Math.abs(t.contracts || 1), expiry: t.expiry,
        currentPrice: t.currentPrice != null ? t.currentPrice : (m.currentPrice != null ? m.currentPrice : null),
        lastWeekPrice: t.leapLastWeekPrice != null ? t.leapLastWeekPrice : (m.lastWeekPrice != null ? m.lastWeekPrice : null),
        costBasis: null,
      };
    });
    const tradeKeys = new Set(tradeLeapRows.map(leapKey));
    const manualLeaps = state.leaps.filter(l => !tradeKeys.has(leapKey(l)));   // manual ที่ไม่ซ้ำกับเทรด
    const leaps = [...tradeLeapRows, ...manualLeaps];
    // บันทึกราคา: ถ้ามาจากเทรด → เก็บบนเทรด, ถ้า manual → เก็บบน leap
    const saveLeapField = (l, field, v) => {
      if (l.fromTrade) window.Store.updateTrade(l.tradeId, { [field === 'lastWeekPrice' ? 'leapLastWeekPrice' : field]: v });
      else window.Store.updateLeap(l.id, { [field]: v });
    };
    const leapCalc = (l) => {
      const c = l.contracts || 1;
      const cost = l.costBasis != null ? l.costBasis : (l.entryPrice * 100 * c);
      const curVal = l.currentPrice != null ? l.currentPrice * 100 * c : null;
      const upl = curVal != null ? curVal - cost : null;
      const uplPct = (upl != null && cost) ? upl / cost : null;
      const dte = l.expiry ? T.daysBetween(new Date().toISOString().slice(0, 10), l.expiry) : null;
      const wow = (l.currentPrice != null && l.lastWeekPrice != null) ? (l.currentPrice - l.lastWeekPrice) * 100 * c : null;
      const wowPct = (l.currentPrice != null && l.lastWeekPrice) ? (l.currentPrice - l.lastWeekPrice) / l.lastWeekPrice : null;
      return { cost, curVal, upl, uplPct, dte, wow, wowPct };
    };
    const leapTot = leaps.reduce((a, l) => { const c = leapCalc(l); a.cost += c.cost; a.cur += (c.curVal || 0); a.upl += (c.upl || 0); a.wow += (c.wow || 0); return a; }, { cost: 0, cur: 0, upl: 0, wow: 0 });

    const snapshotWeek = () => leaps.forEach(l => { if (l.currentPrice != null) saveLeapField(l, 'lastWeekPrice', l.currentPrice); });
    const [copied, setCopied] = useState(false);
    const copyWeeklySummary = () => {
      const txt = formatWeeklySummary({ wkStart, wkEnd, weekNo, closedThis, openedThis, rolledThis, wins, losses, weekPL, exLeap, nlvStart, nlvEnd, wkChange, wkChangePct, mtd, ytd, leaps, leapCalc, ym, yr });
      navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
    };

    const stat = (l, v, sub, cls) => (
      <div style={{ flex: 1 }}>
        <div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px' }}>{l}</div>
        <div className={'num ' + (cls || '')} style={{ fontSize: 17, fontWeight: 600, marginTop: 3 }}>{v}</div>
        {sub && <div className="faint" style={{ fontSize: 11 }}>{sub}</div>}
      </div>
    );

    return (
      <div className="content">
        {/* week navigator */}
        <Card style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn icon-btn" onClick={() => setWkStart(addDays(wkStart, -7))}><Icon name="chevR" size={16} style={{ transform: 'rotate(180deg)' }} /></button>
            <div style={{ textAlign: 'center', minWidth: 168 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>สัปดาห์ที่ {weekNo}</div>
              <div className="faint num" style={{ fontSize: 12 }}>{T.fmtDate(wkStart)} – {T.fmtDate(wkEnd)}</div>
            </div>
            <button className="btn icon-btn" onClick={() => setWkStart(addDays(wkStart, 7))}><Icon name="chevR" size={16} /></button>
          </div>
          <button className="btn btn-sm" onClick={() => setWkStart(startOfWeek(latestDate))}>สัปดาห์ล่าสุด</button>
          <button className={'btn btn-sm ' + (copied ? 'btn-primary' : '')} onClick={copyWeeklySummary} style={{ marginLeft: 4 }}>
            {copied ? '✅ Copied!' : '📋 Copy สรุปสัปดาห์'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {stat('NLV ต้นสัปดาห์', nlvStart != null ? T.fmtMoney(nlvStart) : '—')}
            {stat('NLV ปลายสัปดาห์', nlvEnd != null ? T.fmtMoney(nlvEnd) : '—')}
            {stat('เปลี่ยนแปลง', wkChange != null ? T.fmtMoneyP(wkChange) : '—', wkChangePct != null ? T.fmtPctP(wkChangePct, 2) : null, wkChange > 0 ? 'pos' : wkChange < 0 ? 'neg' : '')}
          </div>
        </Card>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px,100%),1fr))', marginBottom: 18 }}>
          {window.KPI({ label: 'พรีเมียมสัปดาห์นี้', icon: 'coins', accent: true, value: <PL value={weekPL} />, sub: <span className="faint">ไม่รวม LEAP {T.fmtMoneyP(exLeap)}</span> })}
          {window.KPI({ label: 'Win Rate สัปดาห์', icon: 'target', value: T.fmtPct(wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0, 0), sub: <span className="faint">{wins.length}W / {losses.length}L</span> })}
          {window.KPI({ label: 'MTD', icon: 'pulse', value: <PL value={mtd} />, sub: <span className="faint">เดือน {ym}</span> })}
          {window.KPI({ label: 'YTD', icon: 'flame', value: <PL value={ytd} />, sub: <span className="faint">ปี {yr}</span> })}
        </div>

        {/* trade activity */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', alignItems: 'start', marginBottom: 18 }}>
          <Card>
            <div className="card-head"><Icon name="pulse" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">กิจกรรมสัปดาห์นี้</div></div>
            <div className="kv"><span className="k">เปิดใหม่</span><span className="v">{openedThis.length}</span></div>
            <div className="kv"><span className="k">ปิด</span><span className="v">{closedThis.length}</span></div>
            <div className="kv"><span className="k">Rolled</span><span className="v">{rolledThis.length}</span></div>
            <div className="kv"><span className="k">P/L รวม (ปิด)</span><span className="v"><PL value={weekPL} /></span></div>
            <div className="kv"><span className="k">เฉลี่ย/เทรด</span><span className="v"><PL value={closedThis.length ? weekPL / closedThis.length : 0} /></span></div>
          </Card>

          <Card pad={false}>
            <div className="card-pad card-head" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-soft)' }}>
              <Icon name="trades" size={16} style={{ color: 'var(--accent-2)' }} />
              <div className="card-title">เทรดที่ปิด/Roll สัปดาห์นี้</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Ticker</th><th>กลยุทธ์</th><th className="r">P/L</th><th className="r">ROR</th><th className="c">ผล</th><th>โน้ต</th></tr></thead>
                <tbody>
                  {closedThis.map(t => (
                    <tr key={t.id}>
                      <td><span className="tkr">{t.ticker}</span></td>
                      <td style={{ fontSize: 12.5 }}>{t.strategy}</td>
                      <td className="r"><PL value={t.pl} /></td>
                      <td className="r num faint">{t.ror != null ? T.fmtPctP(t.ror, 1) : '—'}</td>
                      <td className="c"><ResultBadge result={t.result} /></td>
                      <td><div className="t-note" style={{ maxWidth: 240 }}>{t.closeNote || t.openNote || ''}</div></td>
                    </tr>
                  ))}
                  {!closedThis.length && <tr><td colSpan={6}><div className="empty">ไม่มีเทรดปิดในสัปดาห์นี้</div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* LEAP tracker */}
        <Card pad={false}>
          <div className="card-pad card-head" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
            <Icon name="layers" size={16} style={{ color: 'var(--accent-2)' }} />
            <div className="card-title">🚀 LEAP Call Tracker <span className="th">— ใส่ "ราคาปัจจุบัน" เพื่อคำนวณ Unrealized + WoW</span></div>
            <div className="card-actions">
              <button className="btn btn-sm" onClick={snapshotWeek} title="บันทึกราคาปัจจุบันเป็นราคาสัปดาห์ก่อน เพื่อเริ่มรอบใหม่"><Icon name="reset" size={14} />สแน็ปช็อตสัปดาห์</button>
            </div>
          </div>
          <div className="card-pad" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
            {stat('LEAP เปิดอยู่', leaps.length, [...new Set(leaps.map(l => l.ticker))].length + ' tickers')}
            {stat('ต้นทุนรวม', T.fmtMoney(leapTot.cost))}
            {stat('มูลค่าปัจจุบัน', T.fmtMoney(leapTot.cur))}
            {stat('Unrealized P/L', T.fmtMoneyP(leapTot.upl), leapTot.cost ? T.fmtPctP(leapTot.upl / leapTot.cost, 1) : null, leapTot.upl > 0 ? 'pos' : leapTot.upl < 0 ? 'neg' : '')}
            {stat('WoW เปลี่ยน', T.fmtMoneyP(leapTot.wow), null, leapTot.wow > 0 ? 'pos' : leapTot.wow < 0 ? 'neg' : '')}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Ticker</th><th className="r">Strike</th><th className="r">ราคาเข้า</th><th className="r">ต้นทุน</th>
                <th className="r">DTE</th><th className="r" style={{ color: 'var(--accent-2)' }}>ราคาปัจจุบัน ✎</th>
                <th className="r">มูลค่า</th><th className="r">Unreal. P/L</th><th className="r">P/L %</th>
                <th className="r" style={{ color: 'var(--accent-2)' }}>สัปดาห์ก่อน ✎</th><th className="r">WoW</th><th className="c">ขาย</th>
              </tr></thead>
              <tbody>
                {leaps.map(l => {
                  const c = leapCalc(l);
                  return (
                    <tr key={l.id}>
                      <td><span className="tkr">{l.ticker}</span></td>
                      <td className="r num">{l.strike}</td>
                      <td className="r num muted">{T.fmtNum(l.entryPrice, 2)}</td>
                      <td className="r num muted">{T.fmtMoney(c.cost)}</td>
                      <td className="r num faint">{c.dte != null ? c.dte : '—'}</td>
                      <td className="r"><EditNum value={l.currentPrice} fmt={v => T.fmtNum(v, 2)} onSave={v => saveLeapField(l, 'currentPrice', v)} /></td>
                      <td className="r num">{c.curVal != null ? T.fmtMoney(c.curVal) : '—'}</td>
                      <td className="r"><PL value={c.upl} /></td>
                      <td className="r num" style={{ color: c.uplPct > 0 ? 'var(--pos-bright)' : c.uplPct < 0 ? 'var(--neg-bright)' : 'var(--text-faint)' }}>{c.uplPct != null ? T.fmtPctP(c.uplPct, 0) : '—'}</td>
                      <td className="r"><EditNum value={l.lastWeekPrice} fmt={v => T.fmtNum(v, 2)} onSave={v => saveLeapField(l, 'lastWeekPrice', v)} /></td>
                      <td className="r">{c.wow != null ? <span><PL value={c.wow} />{c.wowPct != null && <span className="faint num" style={{ fontSize: 11 }}> {T.fmtPctP(c.wowPct, 0)}</span>}</span> : <span className="faint">—</span>}</td>
                      <td className="c">
                        {l.fromTrade ? (
                          <span className="asset-tag opt" title="LEAP นี้มาจากเทรดในหน้า Trades อัตโนมัติ — ต้องการขาย/ปิด ให้ไปปิดเทรดที่หน้า Trades แล้วมันจะหลุดจาก tracker เอง" style={{ fontSize: 10.5 }}>ปิดที่ Trades</span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" title="ขาย / ปิด LEAP นี้ออกจาก tracker" style={{ padding: '3px 7px', color: 'var(--neg-bright)' }}
                            onClick={() => { if (confirm('ขาย / ปิด LEAP ' + l.ticker + ' Strike ' + l.strike + ' ออกจาก tracker?\n(ถ้าต้องการบันทึก P/L จริง ให้ไปปิดเทรด Buy Call (Leap) ในหน้า Trades ด้วย)')) window.Store.deleteLeap(l.id); }}>
                            <Icon name="close" size={13} />ขาย
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!leaps.length && <tr><td colSpan={12}><div className="empty">ยังไม่มี LEAP positions</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  window.WeeklyPage = WeeklyPage;
})();
