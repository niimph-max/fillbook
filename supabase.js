/* ============================================================
   summary.jsx — สรุปผลเทรด: performance by strategy & ticker.
   Exports window.SummaryPage
   ============================================================ */
(function () {
  const { useState, useMemo } = React;
  const { Icon, Card, PL } = window;

  function BreakdownTable({ title, icon, groups, labelHead }) {
    const T = window.TL;
    const [sort, setSort] = useState({ key: 'net', dir: -1 });
    const maxNet = Math.max(1, ...groups.map(g => Math.abs(g.net)));
    const sorted = useMemo(() => groups.slice().sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string') return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    }), [groups, sort]);
    const setK = k => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
    const Th = ({ k, children, cls }) => <th className={cls} onClick={() => setK(k)}>{children}{sort.key === k && <span className="sort-ar">{sort.dir === 1 ? '↑' : '↓'}</span>}</th>;

    const tot = groups.reduce((a, g) => ({ trades: a.trades + g.trades, wins: a.wins + g.wins, losses: a.losses + g.losses, earned: a.earned + g.earned, lost: a.lost + g.lost, net: a.net + g.net }), { trades: 0, wins: 0, losses: 0, earned: 0, lost: 0, net: 0 });

    return (
      <Card pad={false}>
        <div className="card-pad card-head" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-soft)' }}>
          <Icon name={icon} size={16} style={{ color: 'var(--accent-2)' }} />
          <div className="card-title">{title}</div>
          <div className="card-actions faint num" style={{ fontSize: 12 }}>{groups.length} รายการ</div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <Th k="key">{labelHead}</Th>
              <Th k="trades" cls="r">เทรด</Th>
              <Th k="winRate" cls="r">Win%</Th>
              <Th k="earned" cls="r">ได้</Th>
              <Th k="lost" cls="r">เสีย</Th>
              <Th k="net" cls="r">Net P/L</Th>
              <th className="no-sort" style={{ minWidth: 140 }}></th>
            </tr></thead>
            <tbody>
              {sorted.map(g => (
                <tr key={g.key}>
                  <td style={{ fontWeight: 600 }}>{labelHead === 'Ticker' ? <span className="tkr">{g.key}</span> : g.key}</td>
                  <td className="r num muted">{g.trades}<span className="faint" style={{ fontSize: 11 }}> ({g.wins}/{g.losses})</span></td>
                  <td className="r num" style={{ color: g.winRate >= 0.5 ? 'var(--pos-bright)' : 'var(--text-dim)' }}>{T.fmtPct(g.winRate, 0)}</td>
                  <td className="r num pos">{g.earned ? T.fmtMoney(g.earned) : '—'}</td>
                  <td className="r num neg">{g.lost ? T.fmtMoney(g.lost) : '—'}</td>
                  <td className="r"><PL value={g.net} /></td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', height: 14 }}>
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                      <div style={{ position: 'absolute', height: 8, top: 3, borderRadius: 4,
                        background: g.net >= 0 ? 'var(--pos)' : 'var(--neg)',
                        width: (Math.abs(g.net) / maxNet * 48) + '%',
                        left: g.net >= 0 ? '50%' : 'auto', right: g.net < 0 ? '50%' : 'auto' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface-2)', fontWeight: 600 }}>
                <td style={{ borderTop: '1px solid var(--border)' }}>รวม</td>
                <td className="r num" style={{ borderTop: '1px solid var(--border)' }}>{tot.trades}</td>
                <td className="r num" style={{ borderTop: '1px solid var(--border)' }}>{T.fmtPct(tot.trades ? tot.wins / tot.trades : 0, 0)}</td>
                <td className="r num pos" style={{ borderTop: '1px solid var(--border)' }}>{T.fmtMoney(tot.earned)}</td>
                <td className="r num neg" style={{ borderTop: '1px solid var(--border)' }}>{T.fmtMoney(tot.lost)}</td>
                <td className="r" style={{ borderTop: '1px solid var(--border)' }}><PL value={tot.net} /></td>
                <td style={{ borderTop: '1px solid var(--border)' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    );
  }

  function ExpectancyTable({ groups, labelHead }) {
    const T = window.TL;
    const sorted = groups.slice().sort((a, b) => b.expectancy - a.expectancy);
    return (
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{labelHead}</th><th className="r">Expectancy</th><th className="r">Avg Win</th><th className="r">Avg Loss</th><th className="r">เทรด</th><th className="r">Win%</th></tr></thead>
          <tbody>
            {sorted.map(g => {
              const wins = g.list.filter(t => t.result==='Win');
              const losses = g.list.filter(t => t.result==='Loss');
              const avgWin = wins.length ? wins.reduce((s,t)=>s+(t.pl||0),0)/wins.length : 0;
              const avgLoss = losses.length ? losses.reduce((s,t)=>s+(t.pl||0),0)/losses.length : 0;
              const exp = g.trades ? g.net/g.trades : 0;
              return (
                <tr key={g.key}>
                  <td style={{fontWeight:600}}>{labelHead==='Ticker'?<span className="tkr">{g.key}</span>:g.key}</td>
                  <td className="r"><PL value={exp} dp={0} /></td>
                  <td className="r num pos">{T.fmtMoney(avgWin)}</td>
                  <td className="r num neg">{T.fmtMoney(Math.abs(avgLoss))}</td>
                  <td className="r num muted">{g.trades}</td>
                  <td className="r num" style={{color:g.winRate>=0.5?'var(--pos-bright)':'var(--text-dim)'}}>{T.fmtPct(g.winRate,0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function OutlierTrades({ trades }) {
    const T = window.TL;
    const realized = trades.filter(T.isRealized).slice().sort((a,b)=>(b.pl||0)-(a.pl||0));
    const top5 = realized.slice(0,5);
    const bot5 = realized.slice(-5).reverse();
    const Row = ({t}) => (
      <tr>
        <td className="num muted">{T.fmtDate(t.closeDate||t.date)}</td>
        <td><span className="tkr">{t.ticker}</span></td>
        <td style={{fontSize:12.5}}>{t.strategy}</td>
        <td className="r"><PL value={t.pl} /></td>
        <td className="r num faint">{t.ror!=null?T.fmtPctP(t.ror,1):'—'}</td>
        <td><div className="t-note" style={{maxWidth:200}}>{t.closeNote||t.openNote||''}</div></td>
      </tr>
    );
    return (
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr',gap:18}}>
        <Card pad={false}>
          <div className="card-pad" style={{borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:16}}>🏆</span><div className="card-title">Top 5 เทรดดีที่สุด</div>
          </div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>วันที่</th><th>Ticker</th><th>กลยุทธ์</th><th className="r">P/L</th><th className="r">ROR</th><th>โน้ต</th></tr></thead><tbody>{top5.map(t=><Row key={t.id} t={t}/>)}</tbody></table></div>
        </Card>
        <Card pad={false}>
          <div className="card-pad" style={{borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:16}}>⚠️</span><div className="card-title">Bottom 5 เทรดแย่ที่สุด</div>
          </div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>วันที่</th><th>Ticker</th><th>กลยุทธ์</th><th className="r">P/L</th><th className="r">ROR</th><th>โน้ต</th></tr></thead><tbody>{bot5.map(t=><Row key={t.id} t={t}/>)}</tbody></table></div>
        </Card>
      </div>
    );
  }

  // Inline Pro lock — blurs the deep-analytics block for free users,
  // overlays an upgrade CTA. Free users still get KPIs + best/worst cards above.
  function ProLock({ children }) {
    if (window.IS_PRO) return children;
    const goPricing = () => { try { window.location.href = 'OptionzLog Landing.html#pricing'; } catch (e) {} };
    return (
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ filter: 'blur(7px) saturate(0.7)', opacity: 0.4, pointerEvents: 'none', userSelect: 'none', maxHeight: 560, overflow: 'hidden' }} aria-hidden="true">
          {children}
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(600px 320px at 50% 35%, rgba(59,130,246,0.14), transparent 70%)' }}>
          <div style={{ textAlign: 'center', maxWidth: 440, background: 'var(--surface, #11151d)', border: '1px solid var(--accent-line, rgba(59,130,246,0.42))', borderRadius: 20, padding: '34px 32px', boxShadow: '0 40px 90px -50px rgba(0,0,0,0.9)' }}>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: 'linear-gradient(180deg,#60a5fa,#3b82f6)', borderRadius: 99, padding: '4px 13px', marginBottom: 14 }}>PRO</span>
            <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.4px', margin: '0 0 6px' }}>วิเคราะห์เชิงลึก</h2>
            <p style={{ color: 'var(--text-dim, #97a2b3)', fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
              เจาะ performance ตามกลยุทธ์ &amp; ticker, Expectancy รายตัว และ Top/Bottom trades — เห็นว่าอะไรทำเงินจริง อะไรกินทุน ปลดล็อกด้วย Pro
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 15.5 }} onClick={goPricing}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}><path d="M5 16L3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5z"/></svg>
              อัปเกรดเป็น Pro
            </button>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint, #5e6a7d)', marginTop: 14 }}>ทดลองฟรี 14 วัน · ยกเลิกได้ทุกเมื่อ</div>
          </div>
        </div>
      </div>
    );
  }

  function SummaryPage({ accent }) {
    const state = window.useStore();
    const T = window.TL;
    const [assetF, setAssetF] = useState('all');
    const base = assetF === 'all' ? state.trades : state.trades.filter(t => (t.assetType || 'option') === assetF);
    const byStrat = T.groupBy(base, 'strategy');
    const byTicker = T.groupBy(base, 'ticker');
    const m = T.metrics(base);

    const best = byTicker[0], worst = byTicker[byTicker.length - 1];
    const bestStrat = byStrat[0], worstStrat = byStrat[byStrat.length - 1];

    return (
      <div className="content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span className="section-label" style={{ margin: 0 }}>กรองตามสินทรัพย์</span>
          <div className="seg">
            <button className={assetF === 'all' ? 'on' : ''} onClick={() => setAssetF('all')}>ทั้งหมด</button>
            <button className={assetF === 'stock' ? 'on' : ''} onClick={() => setAssetF('stock')}>📈 หุ้น</button>
            <button className={assetF === 'option' ? 'on' : ''} onClick={() => setAssetF('option')}>⚙️ ออปชั่น</button>
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 18 }}>
          {window.KPI({ label: 'Net P/L (Realized)', icon: 'coins', accent: true, value: <PL value={m.net} />, sub: <span className="faint">{m.count} เทรด ปิด+roll</span> })}
          {window.KPI({ label: 'Win Rate', icon: 'target', value: T.fmtPct(m.winRate, 1), sub: <span className="faint">{m.wins}W / {m.losses}L</span> })}
          {window.KPI({ label: 'Avg Win / Loss', icon: 'pulse', value: <span className="num"><span className="pos">{T.fmtMoney(m.avgWin)}</span><span className="faint"> / </span><span className="neg">{T.fmtMoney(Math.abs(m.avgLoss))}</span></span>, sub: <span className="faint">Profit Factor {m.profitFactor === Infinity ? '∞' : T.fmtNum(m.profitFactor, 2)}</span> })}
          {window.KPI({ label: 'Expectancy / เทรด', icon: 'flame', value: <PL value={m.expectancy} dp={0} />, sub: <span className="faint">คาดหวังต่อเทรด</span> })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginBottom: 18 }}>
          <Card style={{ borderColor: 'var(--pos-soft)' }}>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Ticker ดีที่สุด</div>
            {best && <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span className="tkr" style={{ fontSize: 18 }}>{best.key}</span><PL value={best.net} big /></div>}
            {best && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{best.trades} เทรด · Win {T.fmtPct(best.winRate, 0)}</div>}
          </Card>
          <Card>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Ticker แย่ที่สุด</div>
            {worst && <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span className="tkr" style={{ fontSize: 18 }}>{worst.key}</span><PL value={worst.net} big /></div>}
            {worst && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{worst.trades} เทรด · Win {T.fmtPct(worst.winRate, 0)}</div>}
          </Card>
          <Card>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>กลยุทธ์ทำเงินสุด</div>
            {bestStrat && <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{bestStrat.key}</span><PL value={bestStrat.net} big /></div>}
            {bestStrat && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{bestStrat.trades} เทรด · Win {T.fmtPct(bestStrat.winRate, 0)}</div>}
          </Card>
          <Card>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>กลยุทธ์ที่ต้องระวัง</div>
            {worstStrat && <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{worstStrat.key}</span><PL value={worstStrat.net} big /></div>}
            {worstStrat && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{worstStrat.trades} เทรด · Win {T.fmtPct(worstStrat.winRate, 0)}</div>}
          </Card>
        </div>

        <ProLock>
        <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 18 }}>
          <BreakdownTable title="สรุปตามกลยุทธ์" icon="layers" groups={byStrat} labelHead="กลยุทธ์" />
          <BreakdownTable title="สรุปตาม Ticker" icon="summary" groups={byTicker} labelHead="Ticker" />
        </div>
        <div className="section-label" style={{marginTop:24}}>Expectancy Analysis</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          <Card pad={false}>
            <div className="card-pad card-head" style={{marginBottom:0,borderBottom:'1px solid var(--border-soft)'}}><Icon name="flame" size={16} style={{color:'var(--accent-2)'}}/><div className="card-title">Expectancy ตามกลยุทธ์</div></div>
            <ExpectancyTable groups={byStrat} labelHead="กลยุทธ์" />
          </Card>
          <Card pad={false}>
            <div className="card-pad card-head" style={{marginBottom:0,borderBottom:'1px solid var(--border-soft)'}}><Icon name="flame" size={16} style={{color:'var(--accent-2)'}}/><div className="card-title">Expectancy ตาม Ticker</div></div>
            <ExpectancyTable groups={byTicker} labelHead="Ticker" />
          </Card>
        </div>
        <div className="section-label">Outlier Trades</div>
        <OutlierTrades trades={base} />
        </ProLock>
      </div>
    );
  }

  window.SummaryPage = SummaryPage;
})();
