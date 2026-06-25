/* ============================================================
   holdings.jsx — extracted from portfolio.jsx so the Portfolio page
   can be retired. Two reusable pieces:
     • window.StockHoldings  — stock positions table (→ Trades page)
     • window.AccountOverview — deposit / NLV / return / cash (→ Dashboard)
   Stock data still lives in Store.stocks (synced as before).
   ============================================================ */
(function () {
  const { useState, useMemo, useEffect } = React;
  const { Icon, Card, PL, Field, NumInput, Confirm, EditNum } = window;

  // ---------- Stock holdings table (long-term positions, unrealized P/L) ----------
  function StockHoldings() {
    const state = window.useStore();
    const T = window.TL;
    const stocks = state.stocks || [];

    const [refreshing, setRefreshing] = useState(false);
    const [refreshErr, setRefreshErr] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [addingStock, setAddingStock] = useState(false);
    const [newStock, setNewStock] = useState({ ticker: '', shares: null, costPrice: null, costBasis: null, currentPrice: null, note: '' });

    const refreshPrices = async () => {
      setRefreshing(true); setRefreshErr(null);
      try {
        await Promise.all(stocks.map(async s => {
          const d = await window.fetchQuote(s.ticker);
          if (d && d.c && d.c > 0) window.Store.updateStock(s.id, { currentPrice: d.c });
        }));
      } catch (e) { setRefreshErr('โหลดไม่ได้ ลองใหม่'); }
      setRefreshing(false);
    };

    const autoFillCostBasis = (s) => {
      if (s.shares && s.costPrice && s.costBasis == null)
        return { ...s, costBasis: parseFloat((s.shares * s.costPrice).toFixed(2)) };
      return s;
    };
    const saveNewStock = () => {
      const s = autoFillCostBasis(newStock);
      if (!s.ticker || !s.shares || !s.costPrice) return;
      window.Store.addStock({ ticker: s.ticker.toUpperCase().trim(), shares: s.shares, costPrice: s.costPrice, costBasis: s.costBasis || s.shares * s.costPrice, currentPrice: s.currentPrice, note: s.note });
      setNewStock({ ticker: '', shares: null, costPrice: null, costBasis: null, currentPrice: null, note: '' });
      setAddingStock(false);
    };

    const stockRows = useMemo(() => stocks.map(s => {
      const cb = s.costBasis != null ? s.costBasis : (s.costPrice * s.shares);
      const curVal = s.currentPrice != null ? s.currentPrice * s.shares : null;
      const upl = curVal != null ? curVal - cb : null;
      const uplPct = (upl != null && cb) ? upl / cb : null;
      return { ...s, cb, curVal, upl, uplPct };
    }), [stocks]);

    const totalCostBasis = stockRows.reduce((s, r) => s + r.cb, 0);
    const totalCurVal = stockRows.reduce((s, r) => s + (r.curVal || 0), 0);
    const totalUPL = stockRows.reduce((s, r) => s + (r.upl || 0), 0);

    const stat = (l, v, sub, cls) => (
      <div style={{ flex: 1, minWidth: 120 }}>
        <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{l}</div>
        <div className={'num ' + (cls || '')} style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{v}</div>
        {sub && <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{sub}</div>}
      </div>
    );

    return (
      <Card pad={false} style={{ marginBottom: 18 }}>
        <div className="card-pad card-head" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
          <Icon name="coins" size={16} style={{ color: 'var(--accent-2)' }} />
          <div className="card-title">หุ้นที่ถือ <span className="th">Stock Holdings · Unrealized — คลิกชื่อดูกราฟ · ใส่ "ราคาปัจจุบัน" ✎ เพื่ออัปเดต</span></div>
          <div className="card-actions">
            <button className="btn btn-sm" onClick={refreshPrices} disabled={refreshing} style={refreshing ? { opacity: .6 } : null}>
              <Icon name="reset" size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : null} />
              {refreshing ? 'กำลังโหลด…' : '🔄 อัปเดตราคา'}
            </button>
            {refreshErr && <span className="faint" style={{ fontSize: 12, color: 'var(--neg-bright)' }}>{refreshErr}</span>}
            <button className="btn btn-primary btn-sm" onClick={() => setAddingStock(true)}><Icon name="plus" size={14} />เพิ่มหุ้น</button>
          </div>
        </div>
        <div className="card-pad" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
          {stat('ต้นทุนรวม', T.fmtMoney(totalCostBasis))}
          {stat('มูลค่าปัจจุบัน', T.fmtMoney(totalCurVal))}
          {stat('Unrealized P/L', T.fmtMoneyP(totalUPL), totalCostBasis ? T.fmtPctP(totalUPL / totalCostBasis, 1) : null, totalUPL >= 0 ? 'pos' : 'neg')}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticker</th><th>ชื่อ</th>
                <th className="r">หุ้น (Qty)</th><th className="r">ราคาเข้า</th><th className="r">ต้นทุน</th>
                <th className="r" style={{ color: 'var(--accent-2)' }}>ราคาปัจจุบัน ✎</th>
                <th className="r">มูลค่า</th><th className="r">Unreal. P/L</th><th className="r">P/L %</th>
                <th className="c no-sort"></th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map(s => (
                <tr key={s.id}>
                  <td><span className="tkr">{s.ticker}</span></td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{s.note || '—'}</td>
                  <td className="r num">{T.fmtNum(s.shares, s.shares % 1 === 0 ? 0 : 4)}</td>
                  <td className="r num muted">{T.fmtNum(s.costPrice, 2)}</td>
                  <td className="r num muted">{T.fmtMoney(s.cb)}</td>
                  <td className="r">
                    <EditNum value={s.currentPrice} fmt={v => T.fmtNum(v, 2)} onSave={v => window.Store.updateStock(s.id, { currentPrice: v })} />
                  </td>
                  <td className="r num">{s.curVal != null ? T.fmtMoney(s.curVal) : '—'}</td>
                  <td className="r"><PL value={s.upl} /></td>
                  <td className="r num" style={{ color: s.uplPct > 0 ? 'var(--pos-bright)' : s.uplPct < 0 ? 'var(--neg-bright)' : 'var(--text-faint)' }}>{s.uplPct != null ? T.fmtPctP(s.uplPct, 1) : '—'}</td>
                  <td className="c"><button className="btn btn-ghost btn-sm icon-btn" onClick={() => setConfirmDel(s)}><Icon name="trash" size={14} /></button></td>
                </tr>
              ))}
              {!stockRows.length && <tr><td colSpan={10}><div className="empty">ยังไม่มีหุ้น — กด "เพิ่มหุ้น"</div></td></tr>}
            </tbody>
          </table>
        </div>

        {addingStock && (
          <>
            <div className="scrim" onClick={() => setAddingStock(false)} />
            <div className="drawer">
              <div className="drawer-head">
                <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 600 }}>เพิ่มหุ้นใหม่</div></div>
                <button className="btn btn-ghost icon-btn" onClick={() => setAddingStock(false)}><Icon name="close" /></button>
              </div>
              <div className="drawer-body">
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Ticker"><input className="input input-mono" style={{ textTransform: 'uppercase' }} value={newStock.ticker} placeholder="AAPL" onChange={e => setNewStock(s => ({ ...s, ticker: e.target.value }))} /></Field>
                  <Field label="ชื่อบริษัท"><input className="input" value={newStock.note} placeholder="Apple Inc." onChange={e => setNewStock(s => ({ ...s, note: e.target.value }))} /></Field>
                  <Field label="จำนวนหุ้น"><NumInput value={newStock.shares} onChange={v => setNewStock(s => ({ ...s, shares: v }))} placeholder="100" /></Field>
                  <Field label="ราคาเฉลี่ย (Cost Price)"><NumInput value={newStock.costPrice} onChange={v => setNewStock(s => ({ ...s, costPrice: v }))} placeholder="0.00" /></Field>
                  <Field label="ต้นทุนรวม" hint="ถ้าว่างจะคำนวณให้"><NumInput value={newStock.costBasis} onChange={v => setNewStock(s => ({ ...s, costBasis: v }))} placeholder="คำนวณอัตโนมัติ" /></Field>
                  <Field label="ราคาปัจจุบัน"><NumInput value={newStock.currentPrice} onChange={v => setNewStock(s => ({ ...s, currentPrice: v }))} placeholder="0.00" /></Field>
                </div>
              </div>
              <div className="drawer-foot">
                <button className="btn" onClick={() => setAddingStock(false)}>ยกเลิก</button>
                <button className="btn btn-primary" disabled={!newStock.ticker || !newStock.shares || !newStock.costPrice} onClick={saveNewStock}><Icon name="check" size={15} />บันทึก</button>
              </div>
            </div>
          </>
        )}

        <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} danger
          title="ลบหุ้นนี้?" body={confirmDel && confirmDel.ticker + ' — ' + T.fmtNum(confirmDel.shares, 4) + ' shares'}
          onConfirm={() => window.Store.deleteStock(confirmDel.id)} />
      </Card>
    );
  }

  // ---------- Account overview (deposit / NLV / return / cash) ----------
  function AccountOverview() {
    const state = window.useStore();
    const T = window.TL;
    const stocks = state.stocks || [];
    const portfolio = state.portfolio || { totalDeposit: 67000, cash: 38900 };
    const daily = state.daily.slice().filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date));
    const lastNLV = daily.length ? daily[daily.length - 1].nlv : 0;
    const totalDeposit = portfolio.totalDeposit != null ? portfolio.totalDeposit : (portfolio.baseDeposit != null ? portfolio.baseDeposit : 67000);

    const psum = T.positionsSummary(state.positions || []);
    const totalUPL = psum.unreal;
    const optionPL = T.metrics(state.trades.filter(t => (t.assetType || 'option') === 'option')).net;
    const stockRealized = psum.realized;
    const totalReturn = lastNLV - totalDeposit;
    const totalReturnPct = totalDeposit ? totalReturn / totalDeposit : 0;
    const twr = T.cumulativeTWR(daily);

    const [editing, setEditing] = useState(false);
    const [depInput, setDepInput] = useState(totalDeposit);
    const [goalInput, setGoalInput] = useState(window.currentGoal());
    const [startInput, setStartInput] = useState(window.currentMissionStart());
    const [curInput, setCurInput] = useState(portfolio.currency || 'USD');
    const [cashStr, setCashStr] = useState(portfolio.cash == null ? '' : String(portfolio.cash));
    useEffect(() => { setCashStr(portfolio.cash == null ? '' : String(portfolio.cash)); }, [portfolio.cash]);

    const stat = (l, v, sub, cls) => (
      <div style={{ flex: 1, minWidth: 130 }}>
        <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{l}</div>
        <div className={'num ' + (cls || '')} style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{v}</div>
        {sub && <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{sub}</div>}
      </div>
    );

    return (
      <Card style={{ marginBottom: 18, background: 'linear-gradient(135deg, var(--accent-soft), transparent 70%)' }}>
        <div className="card-head">
          <Icon name="wallet" size={16} style={{ color: 'var(--accent-2)' }} />
          <div className="card-title">ภาพรวมบัญชี <span className="th">Account Overview</span></div>
          <div className="card-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => { setDepInput(totalDeposit); setGoalInput(window.currentGoal()); setStartInput(window.currentMissionStart()); setCurInput(portfolio.currency || 'USD'); setEditing(true); }}><Icon name="edit" size={14} />ตั้งค่าบัญชี</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
          {stat('เงินลงทุนรวม', T.fmtMoney(totalDeposit), 'บวกอัตโนมัติเมื่อฝากใน Daily NLV')}
          {stat('NLV ล่าสุด', T.fmtMoney(lastNLV), 'หุ้น + Cash + Options รวมแล้ว')}
          {stat('ผลตอบแทนรวม', T.fmtMoneyP(totalReturn), T.fmtPctP(totalReturnPct, 2), totalReturn >= 0 ? 'pos' : 'neg')}
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
          {stat('หุ้น Unrealized P/L', T.fmtMoneyP(totalUPL), null, totalUPL >= 0 ? 'pos' : 'neg')}
          {stat('หุ้น Realized P/L', T.fmtMoneyP(stockRealized), null, stockRealized >= 0 ? 'pos' : 'neg')}
          {stat('Options Realized P/L', T.fmtMoneyP(optionPL), null, optionPL >= 0 ? 'pos' : 'neg')}
          <div style={{ flex: 1, minWidth: 130 }}>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Cash ในบัญชี <span style={{ fontSize: 10, fontWeight: 400 }}>(อ้างอิง)</span></div>
            <input className="input num" type="text" inputMode="decimal" style={{ maxWidth: 160, padding: '5px 9px', fontSize: 15, fontWeight: 600 }}
              value={cashStr}
              onChange={e => setCashStr(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => { const v = parseFloat(cashStr) || 0; setCashStr(String(v)); window.Store.updatePortfolio({ cash: v }); }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
          </div>
        </div>

        {editing && (
          <>
            <div className="scrim" onClick={() => setEditing(false)} />
            <div className="drawer" style={{ width: 380 }}>
              <div className="drawer-head">
                <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 600 }}>ตั้งค่าบัญชี</div></div>
                <button className="btn btn-ghost icon-btn" onClick={() => setEditing(false)}><Icon name="close" /></button>
              </div>
              <div className="drawer-body">
                <div className="grid" style={{ gap: 14 }}>
                  <Field label="สกุลเงินของพอร์ต" hint="เลือกครั้งเดียว · ทั้งพอร์ตใช้หน่วยเดียวกัน">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className={'btn' + (curInput === 'THB' ? ' btn-primary' : '')} style={{ flex: 1 }} onClick={() => setCurInput('THB')}>฿ ไทย (THB)</button>
                      <button type="button" className={'btn' + (curInput === 'USD' ? ' btn-primary' : '')} style={{ flex: 1 }} onClick={() => setCurInput('USD')}>$ สหรัฐ (USD)</button>
                    </div>
                  </Field>
                  <div className="divider" />
                  <Field label="เงินลงทุนรวม (Total Deposit)" hint={curInput === 'THB' ? '฿' : '$'}><NumInput value={depInput} onChange={setDepInput} placeholder="100000" /></Field>
                  <div className="faint" style={{ fontSize: 12 }}>บวกอัตโนมัติเมื่อกรอกเงินฝากใน Daily NLV ครั้งต่อไป</div>
                  <div className="divider" />
                  <Field label="เป้าหมาย · Road to (มูลค่าพอร์ตที่ตั้งไว้)" hint={curInput === 'THB' ? '฿' : '$'}><NumInput value={goalInput} onChange={setGoalInput} placeholder="100000" /></Field>
                  <Field label="เริ่มนับเป้าหมายจากวันที่">
                    <input className="input" type="date" value={startInput || ''} onChange={e => setStartInput(e.target.value)} />
                  </Field>
                  <div className="faint" style={{ fontSize: 12 }}>ตั้งเป้าหมายของคุณเอง — ไม่จำเป็นต้องเท่าใคร ระบบจะคำนวณความคืบหน้าให้</div>
                </div>
              </div>
              <div className="drawer-foot">
                <button className="btn" onClick={() => setEditing(false)}>ยกเลิก</button>
                <button className="btn btn-primary" onClick={() => { window.Store.updatePortfolio({ totalDeposit: depInput, goal: (+goalInput > 0 ? +goalInput : undefined), missionStart: startInput || undefined, currency: curInput }); setEditing(false); }}><Icon name="check" size={15} />บันทึก</button>
              </div>
            </div>
          </>
        )}
      </Card>
    );
  }

  window.StockHoldings = StockHoldings;
  window.AccountOverview = AccountOverview;
})();
