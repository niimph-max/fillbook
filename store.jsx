/* ============================================================
   payoff.jsx — option payoff (risk) diagram for the Share modal.
   Single-leg only (Sell/Buy Put/Call). Computed exactly from
   strike + premium + contracts. Exports:
     window.payoffSupported(trade) -> bool
     window.PayoffDiagram({ trade })  (returns null if unsupported)
   ============================================================ */
(function () {
  const { useState, useEffect } = React;
  const FINNHUB_KEY = 'd8ods19r01qrbffl14v0d8ods19r01qrbffl14vg';

  // map strategy + direction → single-leg type
  function legType(trade) {
    const s = trade.strategy;
    const short = (trade.contracts || 0) < 0;
    if (s === 'Sell Put') return 'shortPut';
    if (s === 'Sell Call') return 'shortCall';
    if (s === 'Buy Put') return 'longPut';
    if (s === 'Buy Call' || s === 'Buy Call (Leap)') return 'longCall';
    // generic fallback by name
    if (/put/i.test(s)) return short ? 'shortPut' : 'longPut';
    if (/call/i.test(s)) return short ? 'shortCall' : 'longCall';
    return null;
  }
  function supported(trade) {
    if ((trade.assetType || 'option') !== 'option') return false;
    if (trade.strike == null || trade.entryPrice == null) return false;
    return !!legType(trade);
  }
  window.payoffSupported = supported;

  function PayoffDiagram({ trade }) {
    const T = window.TL;
    const [last, setLast] = useState(null);
    const type = legType(trade);

    useEffect(() => {
      let alive = true;
      if (!trade.ticker) return;
      fetch(`https://finnhub.io/api/v1/quote?symbol=${trade.ticker}&token=${FINNHUB_KEY}`)
        .then(r => r.json()).then(d => { if (alive && d && d.c) setLast(d.c); }).catch(() => {});
      return () => { alive = false; };
    }, [trade.ticker]);

    if (!supported(trade)) return null;

    const K = trade.strike;
    const prem = Math.abs(trade.entryPrice);
    const qty = Math.abs(trade.contracts || 1);
    const mult = 100 * qty;
    const isPut = type === 'shortPut' || type === 'longPut';
    const isShort = type === 'shortPut' || type === 'shortCall';

    const perShare = (S) => {
      if (type === 'shortPut') return prem - Math.max(K - S, 0);
      if (type === 'longPut') return Math.max(K - S, 0) - prem;
      if (type === 'shortCall') return prem - Math.max(S - K, 0);
      return Math.max(S - K, 0) - prem; // longCall
    };
    const pl = (S) => perShare(S) * mult;

    const BE = isPut ? (isShort ? K - prem : K - prem) : (K + prem); // put BE = K-prem, call BE = K+prem

    // x-range
    const lo = Math.min(K, BE), hi = Math.max(K, BE);
    const pad = Math.max(K * 0.18, prem * 2.5, (hi - lo) * 1.2, 1);
    let Xmin = Math.max(0, lo - pad), Xmax = hi + pad;
    if (last) { Xmin = Math.min(Xmin, last * 0.94); Xmax = Math.max(Xmax, last * 1.06); }

    // payoff knots: Xmin, K, Xmax (+ BE for the zero split)
    const knots = [Xmin, K, Xmax].map(x => ({ x, p: pl(x) }));
    knots.push({ x: BE, p: 0 });
    knots.sort((a, b) => a.x - b.x);
    const uniq = knots.filter((k, i) => i === 0 || Math.abs(k.x - knots[i - 1].x) > 1e-6);

    const pls = uniq.map(k => k.p);
    let Pmax = Math.max(...pls, 0), Pmin = Math.min(...pls, 0);
    const span = (Pmax - Pmin) || 1;
    Pmax += span * 0.12; Pmin -= span * 0.12;

    const W = 480, H = 270, padL = 52, padR = 18, padT = 16, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const X = (price) => padL + (price - Xmin) / (Xmax - Xmin) * plotW;
    const Y = (p) => padT + (Pmax - p) / (Pmax - Pmin) * plotH;
    const y0 = Y(0);

    const linePts = uniq.map(k => `${X(k.x).toFixed(1)},${Y(k.p).toFixed(1)}`).join(' ');
    const area = (filterFn) => {
      const pts = uniq.filter(filterFn);
      if (pts.length < 2) return null;
      let d = `M ${X(pts[0].x).toFixed(1)} ${y0.toFixed(1)} `;
      pts.forEach(pt => { d += `L ${X(pt.x).toFixed(1)} ${Y(pt.p).toFixed(1)} `; });
      d += `L ${X(pts[pts.length - 1].x).toFixed(1)} ${y0.toFixed(1)} Z`;
      return d;
    };
    const greenD = area(k => k.p >= -1e-6);
    const redD = area(k => k.p <= 1e-6);

    // x ticks
    const ticks = [Xmin, K, last, Xmax].filter(v => v != null && v >= Xmin && v <= Xmax);

    const dte = T.dte(trade);
    const netDollars = prem * mult;
    const dirWord = isShort ? 'Sell' : 'Buy';
    const pcL = isPut ? 'P' : 'C';
    const maxProfit = isShort ? netDollars : (type === 'longCall' ? null : (K - prem) * mult);
    const maxLoss = type === 'longCall' || type === 'longPut' ? -netDollars
      : type === 'shortCall' ? null : -(K - prem) * mult; // shortPut assigned→0
    const moneyness = last ? ((last - K) / K) : null;

    const fmt2 = v => v == null ? '—' : Number(v).toFixed(2);
    const statBox = (label, value, cls) => (
      <div style={{ flex: '1 1 30%', minWidth: 120 }}>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
        <div className={'num ' + (cls || '')} style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{value}</div>
      </div>
    );

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* title */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{trade.strategy} · <span className="tkr" style={{ cursor: 'default', borderBottom: 'none' }}>{trade.ticker}</span></div>
          <div className="num" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {last ? `@ ${fmt2(last)}` : ''} {trade.expiry ? `· Exp ${T.fmtDate(trade.expiry)}` : ''} {dte != null ? `(DTE ${dte})` : ''}
          </div>
        </div>

        {/* chart */}
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          {greenD && <path d={greenD} fill="rgba(38,162,105,.22)" />}
          {redD && <path d={redD} fill="rgba(229,72,77,.20)" />}
          {/* zero line */}
          <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke="var(--border)" strokeWidth="1" />
          {/* strike */}
          <line x1={X(K)} y1={padT} x2={X(K)} y2={H - padB} stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={X(K)} y={padT - 4} fill="var(--text-dim)" fontSize="10" textAnchor="middle" fontFamily="var(--font-mono)">K {fmt2(K)}</text>
          {/* breakeven */}
          <line x1={X(BE)} y1={padT} x2={X(BE)} y2={H - padB} stroke="var(--warn,#d8a229)" strokeWidth="1" strokeDasharray="2 3" />
          {/* last price */}
          {last && <line x1={X(last)} y1={padT} x2={X(last)} y2={H - padB} stroke="var(--pos-bright)" strokeWidth="1.5" />}
          {last && <text x={X(last)} y={padT + 9} fill="var(--pos-bright)" fontSize="10" textAnchor="middle" fontFamily="var(--font-mono)">{fmt2(last)}</text>}
          {/* payoff line */}
          <polyline points={linePts} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
          {/* y labels */}
          <text x={padL - 6} y={Y(Pmax) + 8} fill="var(--text-faint)" fontSize="9.5" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(Pmax)}</text>
          <text x={padL - 6} y={y0 + 3} fill="var(--text-faint)" fontSize="9.5" textAnchor="end" fontFamily="var(--font-mono)">0</text>
          <text x={padL - 6} y={Y(Pmin) - 2} fill="var(--text-faint)" fontSize="9.5" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(Pmin)}</text>
          {/* x ticks */}
          {ticks.map((v, i) => <text key={i} x={X(v)} y={H - padB + 14} fill="var(--text-faint)" fontSize="9.5" textAnchor="middle" fontFamily="var(--font-mono)">{fmt2(v)}</text>)}
        </svg>

        {/* stats */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-soft)' }}>
          {statBox('Trade Setup', `${dirWord} ${fmt2(K)}${pcL} @ ${fmt2(prem)}${qty > 1 ? ` ×${qty}` : ''}`)}
          {statBox(isShort ? 'Net Credit' : 'Net Debit', `${isShort ? '+' : '-'}${window.curSym()}${Math.round(netDollars).toLocaleString()}`, isShort ? 'pos' : 'neg')}
          {statBox('Breakeven', `${fmt2(BE)}${moneyness != null ? '' : ''}`)}
          {statBox('Max Profit', maxProfit == null ? 'ไม่จำกัด' : `+${window.curSym()}${Math.round(maxProfit).toLocaleString()}`, 'pos')}
          {statBox('Max Loss', maxLoss == null ? 'ไม่จำกัด' : `-${window.curSym()}${Math.round(Math.abs(maxLoss)).toLocaleString()}`, 'neg')}
          {statBox('Last / Moneyness', last ? `${fmt2(last)} · ${(moneyness * 100).toFixed(1)}%` : '—')}
        </div>
      </div>
    );
  }

  window.PayoffDiagram = PayoffDiagram;
})();
