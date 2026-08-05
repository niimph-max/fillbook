/* ============================================================
   journal.jsx — บันทึกบทเรียน (auto trade journal)
   ------------------------------------------------------------
   • คิวรีวิว: ไม้ที่ปิดแล้วแต่ยังไม่ได้รีวิว
   • วิเคราะห์นิสัยอัตโนมัติ: ถือถึงหมดอายุ · เทรดแก้แค้น ·
     ไม้ใหญ่เกินตัว · ถือยาวเกิน · กระจุก ticker เดียว
   • สรุปรายเดือน + สถิติตามแท็กที่ผู้ใช้รีวิวเอง
   Exports window.JournalPage, window.pendingReviews
   ============================================================ */
(function () {
  const { useState, useMemo } = React;
  const { Icon, Card, PL, Drawer, Field } = window;

  const PLAN_OPTS = ['ตามแผน', 'ออกนอกแผน', 'ไม่มีแผน'];
  const MOOD_OPTS = ['มั่นใจตามระบบ', 'FOMO', 'แก้แค้นตลาด', 'ลังเล', 'เฉยๆ'];
  const WHY_OPTS = ['ถึงเป้ากำไร', 'ตัดขาดทุนตามแผน', 'ทนไม่ไหว', 'ใกล้หมดอายุ', 'ม้วนสัญญา', 'ข่าว/งบออก', 'ต้องการเงินสด'];

  const isOpt = t => (t.assetType || 'option') === 'option';
  const closedOpts = trades => trades.filter(t => isOpt(t) && window.TL.isRealized(t));
  window.pendingReviews = function (trades) { return closedOpts(trades || []).filter(t => !t.review); };

  // ---- สิ่งที่ระบบอ่านได้เองจากตัวเลข (ไม่ต้องกรอก) ----------------------
  function autoFacts(t) {
    const T = window.TL, out = [];
    const dte = T.dte(t), held = T.daysHeld(t);
    if (held != null && dte != null && dte > 0) {
      out.push({ txt: `ถือ ${held} จาก ${dte} วัน (${Math.round(held / dte * 100)}% ของอายุสัญญา)` });
      if (held >= dte - 1) out.push({ warn: true, txt: 'ปล่อยถึงวันหมดอายุ — รับความเสี่ยงช่วงแกมมาแรงฟรีๆ' });
      else if (held <= 2) out.push({ txt: 'ปิดเร็วภายใน 2 วัน' });
    }
    const isCredit = T.CREDIT_SPREADS.includes(t.strategy) || ['Sell Put', 'Sell Call'].includes(t.strategy);
    if (isCredit && t.entryPrice != null && t.exitPrice != null) {
      const e = Math.abs(t.entryPrice), x = Math.abs(t.exitPrice);
      if (e > 0) {
        const cap = (e - x) / e;
        out.push({ warn: cap > 0.95 && held != null && dte != null && held < dte - 1 ? false : false, txt: `เก็บพรีเมียมได้ ${Math.round(cap * 100)}% ของที่รับมา` });
      }
    }
    if (t.ror != null) out.push({ txt: `ROR ${T.fmtPct(t.ror)}${T.annualizedROR(t) != null ? ' · ต่อปี ' + T.fmtPct(T.annualizedROR(t), 0) : ''}` });
    return out;
  }

  function statsOf(list) {
    const T = window.TL;
    const net = list.reduce((s, t) => s + (t.pl || 0), 0);
    const wins = list.filter(t => t.result === 'Win').length;
    return { n: list.length, net, wins, winRate: list.length ? wins / list.length : 0, avg: list.length ? net / list.length : 0 };
  }

  // ---- วิเคราะห์นิสัย ----------------------------------------------------
  function habits(trades) {
    const T = window.TL;
    const all = closedOpts(trades).slice().sort((a, b) => (a.closeDate || '').localeCompare(b.closeDate || ''));
    if (all.length < 3) return [];
    const base = statsOf(all);
    const out = [];
    const add = (key, title, desc, list) => {
      if (list.length < 2) return;
      const s = statsOf(list);
      out.push({ key, title, desc, ...s, vsAvg: s.avg - base.avg });
    };

    add('expiry', 'ปล่อยถึงวันหมดอายุ', 'ไม้ที่ถือจนเกือบ/ถึงวันหมดอายุ แทนที่จะปิดทำกำไรก่อน',
      all.filter(t => { const d = T.dte(t), h = T.daysHeld(t); return d != null && h != null && d > 0 && h >= d - 1; }));

    // เทรดแก้แค้น: เปิดไม้ใหม่ภายใน 1 วันหลังปิดขาดทุน
    const lossCloses = all.filter(t => t.result === 'Loss' && t.closeDate).map(t => t.closeDate);
    add('revenge', 'เทรดแก้แค้นตลาด', 'ไม้ที่เปิดภายใน 1 วันหลังจากปิดขาดทุน',
      all.filter(t => t.date && lossCloses.some(d => { const g = T.daysBetween(d, t.date); return g != null && g >= 0 && g <= 1; })));

    const sizes = all.map(t => Math.abs(t.contracts || 0)).filter(Boolean).sort((a, b) => a - b);
    const med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
    if (med) add('oversize', 'ไม้ใหญ่เกินปกติ', `ไม้ที่ใช้สัญญามากกว่า ${(med * 1.5).toFixed(1)} (1.5× ค่ากลางของคุณ)`,
      all.filter(t => Math.abs(t.contracts || 0) > med * 1.5));

    add('overheld', 'ถือยาวเกิน 45 วัน', 'เงินจมนาน — วัดว่าคุ้มกับผลตอบแทนหรือไม่',
      all.filter(t => { const h = T.daysHeld(t); return h != null && h > 45; }));

    add('fast', 'ปิดเร็วภายใน 2 วัน', 'ปิดไวมาก — อาจเป็นวินัยดี หรือรีบเก็บกำไรน้อยเกิน',
      all.filter(t => { const h = T.daysHeld(t); return h != null && h <= 2; }));

    // กระจุกตัว: ticker ที่เทรดบ่อยสุด ถ้าเกิน 30% ของไม้ทั้งหมด
    const byT = {};
    all.forEach(t => { const k = (t.ticker || '?').toUpperCase(); (byT[k] = byT[k] || []).push(t); });
    const top = Object.entries(byT).sort((a, b) => b[1].length - a[1].length)[0];
    if (top && top[1].length / all.length >= 0.3) add('conc', 'กระจุกอยู่ที่ ' + top[0], `${Math.round(top[1].length / all.length * 100)}% ของไม้ที่ปิดทั้งหมดอยู่ในตัวนี้`, top[1]);

    // จากรีวิวของผู้ใช้เอง
    add('offplan', 'ไม้ที่ออกนอกแผน', 'คุณรีวิวเองว่าไม้นี้ไม่ได้ทำตามแผน', all.filter(t => t.review && t.review.plan === 'ออกนอกแผน'));
    add('nervous', 'ปิดเพราะทนไม่ไหว', 'ไม้ที่คุณระบุเหตุผลปิดว่า "ทนไม่ไหว"', all.filter(t => t.review && (t.review.why || []).includes('ทนไม่ไหว')));
    MOOD_OPTS.filter(m => m !== 'เฉยๆ' && m !== 'มั่นใจตามระบบ').forEach(m =>
      add('mood_' + m, 'เปิดด้วยอารมณ์: ' + m, 'ไม้ที่คุณระบุอารมณ์ตอนเปิดว่า ' + m, all.filter(t => t.review && t.review.mood === m)));

    return out.sort((a, b) => a.avg - b.avg);
  }

  function HabitCard({ h, base }) {
    const T = window.TL;
    const bad = h.avg < 0;
    const col = bad ? '#e5484d' : h.avg > (base ? base.avg : 0) ? '#37c684' : 'var(--text-dim)';
    return (
      <div className="hcard" style={{ borderColor: bad ? 'rgba(229,72,77,.35)' : 'var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{h.title}</div>
          <span className="faint num" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{h.n} ไม้</span>
        </div>
        <div className="faint" style={{ fontSize: 12, lineHeight: 1.5, margin: '5px 0 9px' }}>{h.desc}</div>
        <div className="hstats">
          <div><div className="l">P/L รวม</div><div className="v num"><PL value={h.net} /></div></div>
          <div><div className="l">เฉลี่ย/ไม้</div><div className="v num" style={{ color: col }}>{T.fmtMoneyP(h.avg, 0)}</div></div>
          <div><div className="l">Win rate</div><div className="v num">{T.fmtPct(h.winRate, 0)}</div></div>
          <div><div className="l">เทียบค่าเฉลี่ย</div><div className="v num" style={{ color: h.vsAvg >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{T.fmtMoneyP(h.vsAvg, 0)}</div></div>
        </div>
      </div>
    );
  }

  function Chip({ on, children, onClick }) {
    return <button type="button" className={'jchip' + (on ? ' on' : '')} onClick={onClick}>{children}</button>;
  }

  function ReviewForm({ trade, onClose }) {
    const T = window.TL;
    const [r, setR] = useState(() => ({ plan: '', mood: '', why: [], lesson: '', ...(trade.review || {}) }));
    const toggleWhy = k => setR(s => ({ ...s, why: (s.why || []).includes(k) ? s.why.filter(x => x !== k) : [...(s.why || []), k] }));
    const facts = autoFacts(trade);
    const save = () => { window.Store.updateTrade(trade.id, { review: { ...r, at: new Date().toISOString() } }); onClose(); };
    return (
      <div>
        <div className="jsum">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span className="tkr" style={{ fontSize: 15 }}>{trade.ticker}</span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{trade.strategy}{trade.strike != null ? ' $' + trade.strike : ''}</span>
            <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700 }}><PL value={trade.pl} /></span>
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{T.fmtDate(trade.date)} → {T.fmtDate(trade.closeDate)}</div>
        </div>
        <div className="section-label">ระบบอ่านได้เองจากตัวเลข</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {facts.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, color: f.warn ? '#d8a229' : 'var(--text-dim)' }}>
              <Icon name={f.warn ? 'alert' : 'check'} size={13} style={{ flexShrink: 0, marginTop: 2 }} />{f.txt}
            </div>
          ))}
          {!facts.length && <div className="faint" style={{ fontSize: 12.5 }}>ข้อมูลไม่พอสรุป</div>}
        </div>
        <div className="section-label">ไม้นี้ทำตามแผนไหม</div>
        <div className="jchips">{PLAN_OPTS.map(o => <Chip key={o} on={r.plan === o} onClick={() => setR(s => ({ ...s, plan: s.plan === o ? '' : o }))}>{o}</Chip>)}</div>
        <div className="section-label" style={{ marginTop: 16 }}>อารมณ์ตอนเปิด</div>
        <div className="jchips">{MOOD_OPTS.map(o => <Chip key={o} on={r.mood === o} onClick={() => setR(s => ({ ...s, mood: s.mood === o ? '' : o }))}>{o}</Chip>)}</div>
        <div className="section-label" style={{ marginTop: 16 }}>เหตุผลที่ปิด <span className="faint" style={{ fontWeight: 400 }}>(เลือกได้หลายข้อ)</span></div>
        <div className="jchips">{WHY_OPTS.map(o => <Chip key={o} on={(r.why || []).includes(o)} onClick={() => toggleWhy(o)}>{o}</Chip>)}</div>
        <div className="section-label" style={{ marginTop: 16 }}>บทเรียน 1 บรรทัด</div>
        <textarea className="input" rows="3" style={{ resize: 'vertical', fontFamily: 'inherit' }} value={r.lesson}
          onChange={e => setR(s => ({ ...s, lesson: e.target.value }))} placeholder="ครั้งหน้าจะทำอะไรต่างจากนี้…" />
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save}><Icon name="check" size={15} />บันทึกรีวิว</button>
          <button className="btn" onClick={onClose}>ยกเลิก</button>
        </div>
      </div>
    );
  }

  function JournalPage() {
    const state = window.useStore();
    const T = window.TL;
    const [editing, setEditing] = useState(null);
    const [tab, setTab] = useState('review');

    const done = closedOpts(state.trades);
    const pending = done.filter(t => !t.review).sort((a, b) => (b.closeDate || '').localeCompare(a.closeDate || ''));
    const reviewed = done.filter(t => t.review).sort((a, b) => (b.closeDate || '').localeCompare(a.closeDate || ''));
    const hb = useMemo(() => habits(state.trades), [state.trades]);
    const base = statsOf(done);
    const worst = hb.filter(h => h.avg < 0).slice(0, 4);
    const good = hb.filter(h => h.avg > base.avg).slice(-3).reverse();

    const months = useMemo(() => {
      const g = {};
      done.forEach(t => { const k = (t.closeDate || '').slice(0, 7); if (!k) return; (g[k] = g[k] || []).push(t); });
      return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([k, list]) => {
        const s = statsOf(list);
        const tagCount = {};
        list.forEach(t => (t.review && t.review.why || []).forEach(w => { tagCount[w] = (tagCount[w] || 0) + 1; }));
        const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0];
        return { k, ...s, topTag: topTag ? topTag[0] : null };
      });
    }, [state.trades]);

    const row = (t) => (
      <div key={t.id} className="jrow" onClick={() => setEditing(t)}>
        <span className="tkr" style={{ fontSize: 13.5, minWidth: 52 }}>{t.ticker}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13 }}>{t.strategy}{t.strike != null ? ' $' + t.strike : ''}</div>
          <div className="faint" style={{ fontSize: 11 }}>{T.fmtDateShort(t.date)} → {T.fmtDateShort(t.closeDate)}
            {t.review && t.review.plan ? ' · ' + t.review.plan : ''}{t.review && t.review.mood ? ' · ' + t.review.mood : ''}</div>
        </div>
        <span className="num" style={{ fontSize: 13.5, fontWeight: 600 }}><PL value={t.pl} /></span>
        <Icon name="chevR" size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
      </div>
    );

    return (
      <div className="content">
        <div className="jtabs">
          <button className={'jtab' + (tab === 'review' ? ' on' : '')} onClick={() => setTab('review')}>รีวิวไม้ที่ปิดแล้ว{pending.length ? <span className="jtab-b">{pending.length}</span> : null}</button>
          <button className={'jtab' + (tab === 'habit' ? ' on' : '')} onClick={() => setTab('habit')}>นิสัยการเทรด</button>
          <button className={'jtab' + (tab === 'month' ? ' on' : '')} onClick={() => setTab('month')}>สรุปรายเดือน</button>
        </div>

        {tab === 'review' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <Card pad={false}>
              <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                <Icon name="alert" size={16} style={{ color: pending.length ? '#d8a229' : 'var(--accent-2)' }} />
                <div className="card-title">รอรีวิว</div>
                <div className="card-actions faint num" style={{ fontSize: 12 }}>{pending.length} ไม้</div>
              </div>
              {pending.length ? <div style={{ padding: '0 10px 10px' }}>{pending.slice(0, 20).map(row)}</div>
                : <div className="card-pad faint" style={{ fontSize: 13 }}>รีวิวครบทุกไม้แล้ว 👌</div>}
            </Card>
            {!!reviewed.length && (
              <Card pad={false}>
                <div className="card-pad card-head" style={{ marginBottom: 0 }}><Icon name="check" size={16} style={{ color: 'var(--pos-bright)' }} /><div className="card-title">รีวิวแล้ว</div><div className="card-actions faint num" style={{ fontSize: 12 }}>{reviewed.length} ไม้</div></div>
                <div style={{ padding: '0 10px 10px' }}>{reviewed.slice(0, 25).map(row)}</div>
              </Card>
            )}
            {!!reviewed.filter(t => t.review.lesson).length && (
              <Card>
                <div className="card-head"><Icon name="book" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">บทเรียนที่เขียนไว้</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {reviewed.filter(t => t.review.lesson).slice(0, 10).map(t => (
                    <div key={t.id} className="jlesson"><span className="tkr" style={{ fontSize: 11.5 }}>{t.ticker}</span> {t.review.lesson}</div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === 'habit' && (
          <div style={{ display: 'grid', gap: 14 }}>
            {hb.length ? (
              <>
                {!!worst.length && (
                  <div>
                    <div className="section-label" style={{ color: '#e5484d' }}>นิสัยที่ทำให้เสียเงิน</div>
                    <div className="hgrid">{worst.map(h => <HabitCard key={h.key} h={h} base={base} />)}</div>
                  </div>
                )}
                {!!good.length && (
                  <div>
                    <div className="section-label" style={{ color: 'var(--pos-bright)' }}>นิสัยที่ทำเงินได้ดีกว่าค่าเฉลี่ย</div>
                    <div className="hgrid">{good.map(h => <HabitCard key={h.key} h={h} base={base} />)}</div>
                  </div>
                )}
                <div>
                  <div className="section-label">ทั้งหมด · ค่าเฉลี่ยพอร์ต {T.fmtMoneyP(base.avg, 0)}/ไม้ จาก {base.n} ไม้</div>
                  <div className="hgrid">{hb.map(h => <HabitCard key={h.key} h={h} base={base} />)}</div>
                </div>
              </>
            ) : <Card><div className="faint" style={{ fontSize: 13 }}>ต้องมีไม้ที่ปิดแล้วอย่างน้อย 3 ไม้ ระบบจึงเริ่มหาแพตเทิร์นได้</div></Card>}
          </div>
        )}

        {tab === 'month' && (
          <Card pad={false}>
            <div className="card-pad card-head" style={{ marginBottom: 0 }}><Icon name="daily" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">ผลรายเดือน</div></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>เดือน</th><th className="r">ไม้</th><th className="r">Win</th><th className="r">P/L</th><th className="r">เฉลี่ย/ไม้</th><th>เหตุผลปิดที่พบมากสุด</th></tr></thead>
                <tbody>
                  {months.map(m => (
                    <tr key={m.k}>
                      <td className="num">{m.k}</td>
                      <td className="r num">{m.n}</td>
                      <td className="r num">{T.fmtPct(m.winRate, 0)}</td>
                      <td className="r num"><PL value={m.net} /></td>
                      <td className="r num" style={{ color: m.avg >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{T.fmtMoneyP(m.avg, 0)}</td>
                      <td className="faint" style={{ fontSize: 12 }}>{m.topTag || '—'}</td>
                    </tr>
                  ))}
                  {!months.length && <tr><td colSpan="6" className="faint" style={{ padding: 18 }}>ยังไม่มีไม้ที่ปิดแล้ว</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Drawer open={!!editing} onClose={() => setEditing(null)} title="รีวิวไม้นี้" sub="ใช้เวลา 20 วินาที — ข้อมูลนี้จะกลายเป็นสถิตินิสัยของคุณ">
          {editing && <ReviewForm trade={editing} onClose={() => setEditing(null)} />}
        </Drawer>
      </div>
    );
  }

  window.JournalPage = JournalPage;
})();
