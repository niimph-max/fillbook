/* ============================================================
   daily.jsx — Road to $250k daily view + NLV entry form.
   Exports window.DailyPage
   ============================================================ */
(function () {
  const { useState, useMemo } = React;
  const { Icon, Card, Field, NumInput, Confirm, PL } = window;

  function DailyPage() {
    const state = window.useStore();
    const T = window.TL;
    const d = window.useDailyShareData();

    const [form, setForm] = useState(() => ({ date: new Date().toISOString().slice(0, 10), nlv: null, realized: null, deposit: null, flowDir: 'in', note: '' }));
    const [confirmDel, setConfirmDel] = useState(null);
    const [showForm, setShowForm] = useState(false);

    const daily = useMemo(() => state.daily.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')), [state.daily]);

    const save = () => {
      if (!form.date || form.nlv == null) return;
      const flow = form.deposit == null ? null : (form.flowDir === 'out' ? -Math.abs(form.deposit) : Math.abs(form.deposit));
      window.Store.upsertDaily({ date: form.date, nlv: form.nlv, realized: form.realized, deposit: flow, note: form.note || null });
      setForm({ date: new Date().toISOString().slice(0, 10), nlv: null, realized: null, deposit: null, flowDir: 'in', note: '' });
      setShowForm(false);
    };

    return (
      <div className="content">

        {/* ── Road to goal header card ── */}
        <Card style={{ marginBottom: 18 }}>
          <div className="card-head" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <div className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>
              Road to {window.fmtGoalFull(window.currentGoal())}
              <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, marginLeft: 8 }}>
                Day {d.dayNum}
              </span>
            </div>
            <div className="card-actions faint" style={{ fontSize: 12 }}>
              Fillbook · {T.fmtDate(d.today)}
            </div>
          </div>

          {/* Inline share content */}
          <window.ShareDailyContent d={d} />

          {/* ── Mission Max Drawdown (แสดงเฉพาะหน้านี้ ไม่แชร์) ── */}
          {d.missionDD && d.missionDD.abs > 0 && (
            <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border-soft)', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-faint)', flex: '0 0 auto' }}>📉 Max Drawdown (ช่วง Mission)</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', flex: 1 }}>
                <div>
                  <div className="num neg" style={{ fontSize: 18, fontWeight: 700 }}>{T.fmtMoney(d.missionDD.abs)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{T.fmtPct(d.missionDD.pct, 1)} จากจุดสูงสุด</div>
                </div>
                {d.missionDD.peakDate && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Peak → Trough</div>
                    <div className="num" style={{ fontSize: 13 }}>{T.fmtDateShort(d.missionDD.peakDate)} → {T.fmtDateShort(d.missionDD.troughDate)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* ── Add / Edit NLV form ── */}
        <Card style={{ marginBottom: 18 }}>
          <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setShowForm(v => !v)}>
            <Icon name="plus" size={16} style={{ color: 'var(--accent-2)' }} />
            <div className="card-title">บันทึก NLV รายวัน</div>
            <div className="card-actions">
              <span style={{ fontSize: 18, color: 'var(--text-faint)', lineHeight: 1, userSelect: 'none' }}>{showForm ? '▲' : '▼'}</span>
            </div>
          </div>
          {showForm && (
            <div className="grid" style={{ gap: 13, marginTop: 12 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 13 }}>
                <Field label="วันที่"><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></Field>
                <Field label="NLV" hint="Net Liquidation Value"><NumInput value={form.nlv} onChange={v => setForm(f => ({ ...f, nlv: v }))} placeholder="0.00" /></Field>
                <Field label="Realized P/L วันนี้" hint="ถ้ามี"><NumInput value={form.realized} onChange={v => setForm(f => ({ ...f, realized: v }))} placeholder="0.00" /></Field>
                <Field label="เงินฝาก/ถอน" hint={form.flowDir === 'out' ? 'ถอนเงินออกจากพอร์ต' : 'ฝากเงินเข้าพอร์ต'}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <div className="seg" style={{ flex: '0 0 auto' }}>
                      <button type="button" className={form.flowDir === 'in' ? 'on' : ''} onClick={() => setForm(f => ({ ...f, flowDir: 'in' }))}>ฝาก</button>
                      <button type="button" className={form.flowDir === 'out' ? 'on' : ''} onClick={() => setForm(f => ({ ...f, flowDir: 'out' }))}>ถอน</button>
                    </div>
                    <NumInput value={form.deposit} onChange={v => setForm(f => ({ ...f, deposit: v == null ? null : Math.abs(v) }))} placeholder="0.00" />
                  </div>
                </Field>
              </div>
              <Field label="โน้ตตลาด"><textarea className="input" value={form.note} placeholder="ภาพตลาดวันนี้, เหตุผล, อารมณ์..." onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></Field>
              <button className="btn btn-primary" disabled={form.nlv == null} style={form.nlv == null ? { opacity: .5 } : null} onClick={save}>
                <Icon name="check" size={15} />บันทึก
              </button>
            </div>
          )}
        </Card>

        {/* ── History table ── */}
        <Card pad={false}>
          <div className="tbl-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr><th>วันที่</th><th className="r">NLV</th><th className="r">Δ วัน</th><th className="r">Realized</th><th className="r">ฝาก/ถอน</th><th>โน้ต</th><th className="c no-sort"></th></tr>
              </thead>
              <tbody>
                {daily.slice().reverse().map((row, i, arr) => {
                  const prev = arr[i + 1];
                  const delta = prev ? row.nlv - prev.nlv : null;
                  return (
                    <tr key={row.date}>
                      <td className="num muted">{T.fmtDate(row.date)}</td>
                      <td className="r num" style={{ fontWeight: 600 }}>{T.fmtMoney(row.nlv)}</td>
                      <td className="r">{delta != null ? <PL value={delta} /> : <span className="faint">—</span>}</td>
                      <td className="r">{row.realized != null ? <PL value={row.realized} /> : <span className="faint">—</span>}</td>
                      <td className="r num">{row.deposit != null && row.deposit !== 0
                        ? <span style={{ color: row.deposit < 0 ? 'var(--neg-bright)' : 'var(--text-dim)' }}>{T.fmtMoneyP(row.deposit)}</span>
                        : <span className="faint">—</span>}</td>
                      <td><div className="t-note" style={{ maxWidth: 280 }}>{row.note || ''}</div></td>
                      <td className="c"><button className="btn btn-ghost btn-sm icon-btn" onClick={() => setConfirmDel(row)}><Icon name="trash" size={14} /></button></td>
                    </tr>
                  );
                })}
                {!daily.length && <tr><td colSpan={7}><div className="empty">ยังไม่มีข้อมูล — กด "บันทึก NLV รายวัน" ด้านบน</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} danger
          title="ลบข้อมูลวันนี้?" body={confirmDel && T.fmtDate(confirmDel.date) + ' — NLV ' + T.fmtMoney(confirmDel.nlv)}
          onConfirm={() => window.Store.deleteDaily(confirmDel.date)} />
      </div>
    );
  }

  window.DailyPage = DailyPage;
})();
