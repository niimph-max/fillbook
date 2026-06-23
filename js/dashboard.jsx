/* ============================================================
   dashboard.jsx — portfolio overview. 3 layout variants
   (1 Classic, 2 Goal-focus, 3 Terminal). Exports window.DashboardPage
   ============================================================ */
(function () {
  const { useMemo, useState } = React;
  const { Icon, Card, PL, StatusBadge, ResultBadge } = window;

  function useDash() {
    const state = window.useStore();
    const T = window.TL;
    return useMemo(() => {
      const goal = window.currentGoal();
      const daily = state.daily.slice().filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date));
      const MISSION_START = window.currentMissionStart();
      const nlvSeries = daily.filter(d => d.date >= MISSION_START).map(d => ({ date: d.date, value: d.nlv }));
      const allNlvSeries = daily.map(d => ({ date: d.date, value: d.nlv })); // all-time for drawdown
      const lastNLV = daily.length ? daily[daily.length - 1].nlv : 0;
      const firstNLV = nlvSeries.length ? nlvSeries[0].value : (daily.length ? daily[0].nlv : 0);
      const m = T.metrics(state.trades);
      const eq = T.equityFromTrades(state.trades);
      const ddNLV = T.maxDrawdown(allNlvSeries);
      const byStrat = T.groupBy(state.trades, 'strategy').slice(0, 7);
      const byTicker = T.groupBy(state.trades, 'ticker').slice(0, 8);
      const recent = state.trades.filter(T.isRealized).slice().sort((a, b) => (b.closeDate || b.date || '').localeCompare(a.closeDate || a.date || '')).slice(0, 8);
      const open = state.trades.filter(t => t.status === 'Opened');
      const sellPutOpen = open.filter(t => t.strategy === 'Sell Put');
      const notionalTotal = sellPutOpen.reduce((s, t) => s + (t.strike || 0) * Math.abs(t.contracts || 0) * 100, 0);
      // portfolio — same account, NLV = total value already
      const stocks = state.stocks || [];
      const portfolio = state.portfolio || { totalDeposit: 67000, cash: 38900 };
      const totalPortfolio = lastNLV;
      const totalDeposit = portfolio.totalDeposit != null ? portfolio.totalDeposit : (portfolio.baseDeposit != null ? portfolio.baseDeposit : 67000);
      const totalReturn = totalPortfolio - totalDeposit;
      const totalReturnPct = totalDeposit ? totalReturn / totalDeposit : 0;
      // recent NLV momentum
      const last2 = daily.slice(-2);
      const dayChange = last2.length === 2 ? last2[1].nlv - last2[0].nlv : 0;
      const twr = T.cumulativeTWR(daily);
      return { state, T, goal, daily, nlvSeries, lastNLV, firstNLV, m, eq, ddNLV, byStrat, byTicker, recent, open, totalDeposit, dayChange, twr, sellPutOpen, notionalTotal, totalPortfolio, totalReturn, totalReturnPct };
    }, [state]);
  }

  function GoalBar({ d, onShare }) {
    const T = d.T; const GOAL = d.goal; const pct = Math.max(0, Math.min(1, d.lastNLV / GOAL));
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="target" size={16} style={{ color: 'var(--accent-2)' }} />Road to {window.fmtGoalFull(GOAL)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="num muted" style={{ fontSize: 13 }}>{T.fmtPct(pct, 1)} · เหลือ {T.fmtMoney(GOAL - d.lastNLV)}</span>
            <button className="btn btn-sm" onClick={onShare} title="Share Daily Update" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px' }}>
              <svg width="11" height="11" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" /></svg>
              Share Daily
            </button>
          </div>
        </div>
        <div className="prog"><div style={{ width: (pct * 100) + '%' }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }} className="faint num">
          <span>{T.fmtMoney(d.lastNLV)}</span><span>{T.fmtMoney(GOAL)}</span>
        </div>
      </div>
    );
  }

  function StratBreakdown({ d, max = 7 }) {
    const T = d.T;
    const groups = d.byStrat;
    const peak = Math.max(1, ...groups.map(g => Math.abs(g.net)));
    return (
      <div>
        {groups.map(g => (
          <div className="barrow" key={g.key}>
            <span className="b-label" title={g.key}>{g.key}</span>
            <div className="bartrack"><div className="barfill" style={{ width: (Math.abs(g.net) / peak * 100) + '%', background: g.net >= 0 ? 'var(--pos)' : 'var(--neg)' }} /></div>
            <span className="b-val" style={{ color: g.net >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{T.fmtMoneyP(g.net)}</span>
          </div>
        ))}
      </div>
    );
  }

  function TickerChips({ d }) {
    const T = d.T;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {d.byTicker.map(g => (
          <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <span className="tkr" style={{ width: 58 }}>{g.key}</span>
            <span className="faint num" style={{ fontSize: 11.5, width: 70 }}>{g.trades} · {T.fmtPct(g.winRate, 0)}</span>
            <div style={{ flex: 1 }} />
            <PL value={g.net} />
          </div>
        ))}
      </div>
    );
  }

  function RecentTrades({ d, compact }) {
    const T = d.T;
    return (
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>วันที่</th><th>Ticker</th>{!compact && <th>กลยุทธ์</th>}<th className="r">P/L</th><th className="c">ผล</th></tr></thead>
          <tbody>
            {d.recent.map(t => (
              <tr key={t.id}>
                <td className="num muted">{T.fmtDate(t.closeDate || t.date)}</td>
                <td><span className="tkr">{t.ticker}</span></td>
                {!compact && <td style={{ fontSize: 12.5 }}>{t.strategy}</td>}
                <td className="r"><PL value={t.pl} /></td>
                <td className="c"><ResultBadge result={t.result} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function kpis(d) {
    const T = d.T;
    return {
      nlv: window.KPI({ label: 'Net Liq. Value', icon: 'wallet', accent: true, value: T.fmtMoney(d.lastNLV), delta: T.fmtMoneyP(d.dayChange), deltaUp: d.dayChange >= 0, sub: <span className="faint">วันล่าสุด</span>, spark: d.nlvSeries.slice(-30).map(s => s.value), sparkColor: 'var(--accent)' }),
      net: window.KPI({ label: 'Net P/L (Realized)', icon: 'coins', value: <PL value={d.m.net} />, sub: <span className="faint">{d.m.count} เทรด</span> }),
      win: window.KPI({ label: 'Win Rate', icon: 'target', value: T.fmtPct(d.m.winRate, 1), sub: <span className="faint">{d.m.wins}W / {d.m.losses}L</span> }),
      pf: window.KPI({ label: 'Profit Factor', icon: 'pulse', value: <span className="num">{d.m.profitFactor === Infinity ? '∞' : T.fmtNum(d.m.profitFactor, 2)}</span>, sub: <span className="faint">ได้/เสีย</span> }),
      exp: window.KPI({ label: 'Expectancy', icon: 'flame', value: <PL value={d.m.expectancy} dp={0} />, sub: <span className="faint">ต่อเทรด</span> }),
      dd: window.KPI({ label: 'Max Drawdown', icon: 'alert', value: <span className="num neg">{T.fmtMoney(d.ddNLV.abs)}</span>, sub: <span className="faint">{T.fmtPct(d.ddNLV.pct, 1)}{d.ddNLV.peakDate ? ' · ' + T.fmtDateShort(d.ddNLV.peakDate) + ' → ' + T.fmtDateShort(d.ddNLV.troughDate) : ''}</span> }),
      open: window.KPI({ label: 'เปิดอยู่', icon: 'layers', value: d.open.length, sub: <span className="faint">{[...new Set(d.open.map(t => t.ticker))].length} tickers</span> }),
      notional: window.KPI({ label: 'Notional (Sell Put)', icon: 'wallet', value: T.fmtMoney(d.notionalTotal), sub: <span className="faint">{d.sellPutOpen.length} Sell Put opened</span> }),
      totalPort: window.KPI({ label: 'Total Portfolio', icon: 'coins', accent: true, value: T.fmtMoney(d.totalPortfolio), delta: T.fmtPctP(d.totalReturnPct, 1), deltaUp: d.totalReturn >= 0, sub: <span className="faint">{T.fmtMoneyP(d.totalReturn)} จากลงทุน {T.fmtMoney(d.totalDeposit)}</span> }),
      twr: window.KPI({ label: 'TWR สะสม', icon: 'pulse', accent: true, value: <span className={'num ' + (d.twr != null && d.twr < 0 ? 'neg' : 'pos')}>{d.twr != null ? T.fmtPctP(d.twr, 1) : '—'}</span>, sub: <span className="faint">ผลงานจริง · ตัดผลฝาก/ถอน</span> }),
    };
  }

  function EquityCard({ d, title, height = 280 }) {
    const T = d.T;
    return (
      <Card>
        <div className="card-head">
          <Icon name="pulse" size={16} style={{ color: 'var(--accent-2)' }} />
          <div className="card-title">{title || 'เส้นทุน (NLV)'}</div>
          <div className="card-actions faint num" style={{ fontSize: 12 }}>{d.nlvSeries.length} วัน</div>
        </div>
        {d.nlvSeries.length > 1
          ? <window.LineChart data={d.nlvSeries} height={height} color="var(--accent)" fmtY={v => window.curSym() + (v / 1000).toFixed(0) + 'k'} fmtX={s => T.fmtDateShort(s)} fmtTip={p => T.fmtMoney(p.value)} baseline={d.firstNLV} />
          : <div className="empty">เพิ่มข้อมูล NLV รายวันเพื่อดูกราฟ</div>}
      </Card>
    );
  }

  function CumPLCard({ d, height = 280 }) {
    const T = d.T;
    return (
      <Card>
        <div className="card-head">
          <Icon name="coins" size={16} style={{ color: 'var(--accent-2)' }} />
          <div className="card-title">กำไรสะสม (Realized)</div>
          <div className="card-actions faint num" style={{ fontSize: 12 }}>{d.eq.length} เทรด</div>
        </div>
        {d.eq.length > 1
          ? <window.LineChart data={d.eq} height={height} color="var(--pos)" fmtY={v => window.curSym() + (v / 1000).toFixed(0) + 'k'} fmtX={s => T.fmtDateShort(s)} fmtTip={p => T.fmtMoneyP(p.value)} baseline={0} />
          : <div className="empty">ยังไม่มีเทรดที่ปิด</div>}
      </Card>
    );
  }

  function DashboardPage({ variant = 1 }) {
    const d = useDash();
    const K = kpis(d);
    const [shareOpen, setShareOpen] = useState(false);

    // ---- Variant 1: Classic ----
    if (variant === 1) {
      return (
        <div className="content">
          {shareOpen && <window.ShareDailyCard onClose={() => setShareOpen(false)} />}
          <window.AccountOverview />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', marginBottom: 18 }}>
            {K.net}{K.win}{K.pf}{K.exp}{K.dd}{K.notional}
          </div>
          <Card style={{ marginBottom: 18 }}><GoalBar d={d} onShare={() => setShareOpen(true)} /></Card>
          <div className="grid" style={{ gridTemplateColumns: '1.45fr 1fr', marginBottom: 18, gap: 18 }}>
            <EquityCard d={d} />
            <Card>
              <div className="card-head"><Icon name="layers" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">P/L ตามกลยุทธ์</div></div>
              <StratBreakdown d={d} />
            </Card>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card pad={false}>
              <div className="card-pad card-head" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-soft)' }}><Icon name="trades" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">เทรดล่าสุด</div></div>
              <RecentTrades d={d} />
            </Card>
            <Card>
              <div className="card-head"><Icon name="target" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">Top Tickers</div></div>
              <TickerChips d={d} />
            </Card>
          </div>
        </div>
      );
    }

    // ---- Variant 2: Goal-focus hero ----
    if (variant === 2) {
      const T = d.T; const pct = Math.max(0, Math.min(1, d.lastNLV / d.goal));
      return (
        <div className="content">
          {shareOpen && <window.ShareDailyCard onClose={() => setShareOpen(false)} />}
          <window.AccountOverview />
          <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 18, alignItems: 'stretch' }}>
            <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-soft), transparent 70%)' }}>
              <div className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.7px' }}>Net Liquidation Value</div>
              <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.05, margin: '6px 0' }} className="num">{T.fmtMoney(d.lastNLV)}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
                <span className={'chip ' + (d.dayChange >= 0 ? 'up' : 'down')}>{T.fmtMoneyP(d.dayChange)}</span>
                <span className="faint" style={{ fontSize: 12.5 }}>วันล่าสุด · Net P/L รวม </span><PL value={d.m.net} />
              </div>
              <GoalBar d={d} onShare={() => setShareOpen(true)} />
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              {K.win}{K.pf}{K.exp}{K.dd}{K.notional}{K.net}
            </div>
          </div>
          <Card style={{ marginBottom: 18 }}><EquityCard d={d} title="เส้นทุน (NLV)" height={300} /></Card>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card><div className="card-head"><Icon name="layers" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">P/L ตามกลยุทธ์</div></div><StratBreakdown d={d} /></Card>
            <Card><div className="card-head"><Icon name="target" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">Top Tickers</div></div><TickerChips d={d} /></Card>
          </div>
        </div>
      );
    }

    // ---- Variant 3: Terminal (dense) ----
    return (
      <div className="content">
        {shareOpen && <window.ShareDailyCard onClose={() => setShareOpen(false)} />}
        <window.AccountOverview />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(132px,1fr))', marginBottom: 16 }}>
          {K.net}{K.win}{K.pf}{K.exp}{K.dd}{K.open}{K.notional}
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <EquityCard d={d} height={220} />
          <CumPLCard d={d} height={220} />
        </div>
        <Card style={{ marginBottom: 16 }}><GoalBar d={d} /></Card>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Card><div className="card-head"><div className="card-title">P/L ตามกลยุทธ์</div></div><StratBreakdown d={d} /></Card>
          <Card><div className="card-head"><div className="card-title">Top Tickers</div></div><TickerChips d={d} /></Card>
          <Card pad={false}>
            <div className="card-pad card-head" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-soft)' }}><div className="card-title">เทรดล่าสุด</div></div>
            <RecentTrades d={d} compact />
          </Card>
        </div>
      </div>
    );
  }

  window.DashboardPage = DashboardPage;
})();
