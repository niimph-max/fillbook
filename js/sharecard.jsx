/* ============================================================
   sharecard.jsx — Daily Share Card: Road to $250k
   Exports: window.ShareDailyCard (modal)
            window.ShareDailyContent (inline)
            window.useDailyShareData (hook)
   ============================================================ */
(function () {
  const { useState, useMemo } = React;

  const MISSION_START = '2026-06-01';
  const goalHash = g => '#Roadto' + (g % 1000 === 0 ? Math.round(g / 1000) + 'K' : g);

  /* ---- Data hook ---- */
  function useDailyShareData() {
    const state = window.useStore();
    const T = window.TL;
    return useMemo(() => {
      const GOAL = window.currentGoal();
      const daily = state.daily.slice().filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date));
      const missionDaily = daily.filter(d => d.date >= window.currentMissionStart());
      const last = daily[daily.length - 1];
      const lastNLV = last ? last.nlv : 0;
      const today = last ? last.date : new Date().toISOString().slice(0, 10);
      const startMs = new Date(window.currentMissionStart()).getTime();
      const todayMs = new Date(today + 'T00:00:00Z').getTime();
      const dayNum = Math.max(1, Math.floor((todayMs - startMs) / 86400000) + 1);
      const missionFirst = missionDaily[0];
      const startingBalance = missionFirst ? missionFirst.nlv : lastNLV;
      const prev = daily.length >= 2 ? daily[daily.length - 2] : null;
      const dailyChange = prev ? lastNLV - prev.nlv : 0;
      const deposit = last ? (last.deposit || 0) : 0;
      const prevNLV = prev ? prev.nlv : null;
      const dailyTWR = prevNLV && prevNLV !== 0 ? (lastNLV - deposit) / prevNLV - 1 : null;
      const dailyRealized = last ? (last.realized || null) : null;
      let streak = 0, streakDir = null;
      for (let i = daily.length - 1; i >= 1; i--) {
        const delta = daily[i].nlv - daily[i - 1].nlv;
        if (streakDir === null) { streakDir = delta >= 0 ? 'up' : 'down'; streak = 1; }
        else if ((delta >= 0 && streakDir === 'up') || (delta < 0 && streakDir === 'down')) streak++;
        else break;
      }
      const amountNeeded = GOAL - lastNLV;
      const progress = Math.max(0, Math.min(1, lastNLV / GOAL));
      const nlvSeries = missionDaily.map(d => ({ date: d.date, value: d.nlv }));
      const missionDD = T.maxDrawdown(nlvSeries);
      return { daily, lastNLV, today, dayNum, startingBalance, dailyChange, dailyTWR, dailyRealized, streak, streakDir, amountNeeded, progress, nlvSeries, missionDD, goal: GOAL, T };
    }, [state]);
  }

  /* ---- Canvas card generator (reliable, no CSS var issues) ---- */
  function drawShareCanvas(d, T) {
    const GOAL = d.goal;
    const MLABEL = window.missionStartLabel();
    const GFULL = window.fmtGoalFull(GOAL);   // $50,000
    const GSHORT = window.fmtGoalShort(GOAL); // $50k
    const cs = getComputedStyle(document.documentElement);
    const g = (v, fb) => { const r = cs.getPropertyValue(v).trim(); return r || fb; };
    const BG     = g('--bg',         '#0a0d13');
    const CARD   = g('--surface-2',  '#161b25');
    const CARD3  = g('--surface-3',  '#1d2430');
    const ACCENT = g('--accent',     '#3b82f6');
    const ACC2   = g('--accent-2',   '#60a5fa');
    const POS    = g('--pos',        '#26a269');
    const NEG    = g('--neg',        '#e5484d');
    const TXT    = g('--text',       '#e8ecf3');
    const DIM    = g('--text-dim',   '#97a2b3');
    const FAINT  = g('--text-faint', '#5e6a7d');
    const BORDER = g('--border',     '#232b39');

    // roundRect polyfill
    const rr = (ctx, x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    };

    const W = 800, H = 620, PAD = 26, S = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * S; canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);

    // BG
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // Header gradient
    const hg = ctx.createLinearGradient(0, 0, W * 0.5, 0);
    hg.addColorStop(0, 'rgba(59,130,246,0.18)'); hg.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, 68);

    let y = PAD;

    // Title
    ctx.fillStyle = TXT;
    ctx.font = 'bold 20px "IBM Plex Mono",monospace';
    ctx.fillText('🎯 Road to ' + GFULL, PAD, y + 20);

    // Day badge
    const titleW = ctx.measureText('🎯 Road to ' + GFULL).width;
    const dayLabel = 'Day ' + d.dayNum;
    ctx.font = 'bold 12px system-ui,sans-serif';
    const dw = ctx.measureText(dayLabel).width + 18;
    const bx = PAD + titleW + 12;
    ctx.fillStyle = ACCENT;
    rr(ctx, bx, y + 4, dw, 20, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(dayLabel, bx + dw / 2, y + 18);
    ctx.textAlign = 'left';

    y += 30;
    ctx.fillStyle = FAINT;
    ctx.font = '11px system-ui,sans-serif';
    ctx.fillText('Fillbook  ·  ' + T.fmtDate(d.today), PAD, y + 12);
    y += 22;

    // Starting balance bar
    ctx.fillStyle = 'rgba(59,130,246,0.1)';
    rr(ctx, PAD, y, W - PAD * 2, 38, 6); ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(PAD, y, 3, 38);
    ctx.fillStyle = FAINT;
    ctx.font = '9.5px system-ui,sans-serif';
    ctx.fillText('STARTING BALANCE BASE  ·  ' + MLABEL.toUpperCase(), PAD + 12, y + 14);
    ctx.fillStyle = TXT;
    ctx.font = 'bold 17px "IBM Plex Mono",monospace';
    const sb = T.fmtMoney(d.startingBalance);
    ctx.fillText(sb, PAD + 12, y + 30);
    ctx.fillStyle = FAINT;
    ctx.font = '11px "IBM Plex Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Target: ' + GFULL, W - PAD, y + 30);
    ctx.textAlign = 'left';
    y += 50;

    // Metric boxes (2 rows x 3)
    const streakC = d.streakDir === 'up' ? POS : NEG;
    const changeC = d.dailyChange >= 0 ? POS : NEG;
    const twrC    = d.dailyTWR != null && d.dailyTWR >= 0 ? POS : NEG;
    const realC   = d.dailyRealized == null ? FAINT : d.dailyRealized >= 0 ? POS : NEG;
    const metrics = [
      { label: 'STREAK',          icon: '🔥', value: d.streak + ' วัน',                                        sub: d.streakDir === 'up' ? '▲ Up Days in a row' : '▼ Down Days',  color: streakC },
      { label: 'CURRENT BALANCE', icon: '💰', value: T.fmtMoney(d.lastNLV),                                    sub: 'from ' + T.fmtMoney(d.startingBalance),                      color: ACCENT  },
      { label: 'DAILY CHANGE',    icon: '📊', value: T.fmtMoneyP(d.dailyChange),                               sub: 'vs เมื่อวาน',                                                  color: changeC },
      { label: 'DAILY TWR',       icon: '📈', value: d.dailyTWR != null ? T.fmtPctP(d.dailyTWR, 2) : '—',    sub: 'Time-weighted',                                               color: twrC    },
      { label: 'DAILY REALIZED',  icon: '💵', value: d.dailyRealized != null ? T.fmtMoneyP(d.dailyRealized) : '—', sub: 'P/L วันนี้',                                           color: realC   },
      { label: 'AMOUNT NEEDED',   icon: '🏁', value: T.fmtMoney(d.amountNeeded),                               sub: 'เหลืออีก ' + T.fmtPct(1 - d.progress, 1),                   color: '#a855f7'},
    ];
    const cols = 3, bW = (W - PAD * 2 - 10 * (cols - 1)) / cols, bH = 70;
    metrics.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx2 = PAD + col * (bW + 10), by = y + row * (bH + 8);
      // Box background (rounded)
      ctx.fillStyle = CARD; rr(ctx, bx2, by, bW, bH, 7); ctx.fill();
      // Colored top strip (3px, simple rect)
      ctx.fillStyle = m.color;
      ctx.fillRect(bx2, by, bW, 3);
      ctx.fillStyle = FAINT; ctx.font = '9.5px system-ui,sans-serif';
      ctx.fillText(m.icon + '  ' + m.label, bx2 + 9, by + 19);
      ctx.fillStyle = TXT; ctx.font = 'bold 15px "IBM Plex Mono",monospace';
      ctx.fillText(m.value, bx2 + 9, by + 42);
      ctx.fillStyle = DIM; ctx.font = '10px system-ui,sans-serif';
      ctx.fillText(m.sub, bx2 + 9, by + 58);
    });
    y += 2 * bH + 1 * 8 + 14;

    // Progress bar
    ctx.fillStyle = FAINT; ctx.font = '11px system-ui,sans-serif';
    ctx.fillText('Progress toward ' + GFULL, PAD, y + 11);
    ctx.fillStyle = ACC2; ctx.font = 'bold 12px "IBM Plex Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText(T.fmtPct(d.progress, 1), W - PAD, y + 11);
    ctx.textAlign = 'left';
    y += 18;
    const barW = W - PAD * 2;
    ctx.fillStyle = CARD3; rr(ctx, PAD, y, barW, 9, 4.5); ctx.fill();
    const filled = barW * d.progress;
    if (filled > 1) {
      const pg = ctx.createLinearGradient(PAD, 0, PAD + filled, 0);
      pg.addColorStop(0, ACCENT); pg.addColorStop(1, ACC2);
      ctx.fillStyle = pg; rr(ctx, PAD, y, filled, 9, 4.5); ctx.fill();
    }
    y += 14;
    ctx.fillStyle = FAINT; ctx.font = '10px "IBM Plex Mono",monospace';
    ctx.fillText(T.fmtMoney(d.lastNLV), PAD, y + 10);
    ctx.textAlign = 'right'; ctx.fillText(GFULL, W - PAD, y + 10); ctx.textAlign = 'left';
    y += 24;

    // NLV Chart
    const chartH = 150, cPadL = 46, cPadR = 16, cPadT = 8, cPadB = 22;
    ctx.fillStyle = CARD; rr(ctx, PAD, y, W - PAD * 2, chartH + 40, 8); ctx.fill();
    ctx.fillStyle = FAINT; ctx.font = '10px system-ui,sans-serif';
    ctx.fillText('\uD83C\uDFAF  Road to ' + GFULL + ' \u2014 From ' + MLABEL, PAD + 10, y + 17);
    ctx.textAlign = 'right'; ctx.fillText(d.nlvSeries.length + ' \u0E27\u0E31\u0E19', W - PAD - 6, y + 17); ctx.textAlign = 'left';
    y += 26;
    if (d.nlvSeries && d.nlvSeries.length >= 2) {
      const vals = d.nlvSeries.map(p => p.value);
      let clo = Math.min(...vals, GOAL * 0.94), chi = Math.max(...vals, GOAL * 1.01);
      const cspan = chi - clo || 1;
      clo -= cspan * 0.06; chi += cspan * 0.04;
      const cW = W - PAD * 2 - cPadL - cPadR;
      const cH2 = chartH - cPadT - cPadB;
      const ox = PAD + cPadL, oy2 = y + cPadT;
      const CX = i => ox + (d.nlvSeries.length <= 1 ? cW / 2 : (i / (d.nlvSeries.length - 1)) * cW);
      const CY = v => oy2 + cH2 - ((v - clo) / (chi - clo)) * cH2;
      // grid
      Array.from({ length: 4 }, (_, i) => clo + (chi - clo) * i / 3).forEach(v => {
        const yy = CY(v);
        ctx.strokeStyle = 'rgba(35,43,57,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ox, yy); ctx.lineTo(ox + cW, yy); ctx.stroke();
        ctx.fillStyle = FAINT; ctx.font = '9px "IBM Plex Mono",monospace';
        ctx.textAlign = 'right'; ctx.fillText('$' + (v / 1000).toFixed(0) + 'k', ox - 4, yy + 3); ctx.textAlign = 'left';
      });
      // goal dashed line
      const gY = CY(GOAL);
      if (gY >= oy2 && gY <= oy2 + cH2) {
        ctx.strokeStyle = 'rgba(248,113,113,0.7)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(ox, gY); ctx.lineTo(ox + cW, gY); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(248,113,113,0.85)'; ctx.font = '9px system-ui';
        ctx.textAlign = 'right'; ctx.fillText('Target ' + GSHORT, ox + cW - 2, gY - 4); ctx.textAlign = 'left';
      }
      // area
      const ag = ctx.createLinearGradient(0, oy2, 0, oy2 + cH2);
      ag.addColorStop(0, 'rgba(59,130,246,0.22)'); ag.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.beginPath(); ctx.moveTo(CX(0), CY(d.nlvSeries[0].value));
      d.nlvSeries.forEach((p, i) => { if (i > 0) ctx.lineTo(CX(i), CY(p.value)); });
      ctx.lineTo(CX(d.nlvSeries.length - 1), oy2 + cH2); ctx.lineTo(ox, oy2 + cH2); ctx.closePath();
      ctx.fillStyle = ag; ctx.fill();
      // line
      ctx.beginPath(); ctx.moveTo(CX(0), CY(d.nlvSeries[0].value));
      d.nlvSeries.forEach((p, i) => { if (i > 0) ctx.lineTo(CX(i), CY(p.value)); });
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      // end dot
      const lx = CX(d.nlvSeries.length - 1), ly = CY(d.nlvSeries[d.nlvSeries.length - 1].value);
      ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
      ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.strokeStyle = BG; ctx.lineWidth = 2; ctx.stroke();
      // x labels
      const TL = window.TL;
      [0, Math.floor((d.nlvSeries.length - 1) / 2), d.nlvSeries.length - 1].forEach(i => {
        ctx.fillStyle = FAINT; ctx.font = '9px system-ui,sans-serif';
        ctx.textAlign = i === 0 ? 'left' : i === d.nlvSeries.length - 1 ? 'right' : 'center';
        ctx.fillText(TL.fmtDateShort(d.nlvSeries[i].date), CX(i), oy2 + cH2 + 14);
      });
      ctx.textAlign = 'left';
    }
    y += chartH + 18;
    ctx.fillStyle = ACC2; ctx.font = '11.5px system-ui,sans-serif';
    ctx.fillText('#OptionTradingLog  #บันทึกการเทรดออปชั่น  ' + goalHash(GOAL), PAD, y + 12);
    ctx.fillStyle = FAINT; ctx.font = '11px system-ui,sans-serif';
    ctx.textAlign = 'right'; ctx.fillText('Fillbook', W - PAD, y + 12); ctx.textAlign = 'left';

    return canvas;
  }

  /* ---- Inline SVG chart ---- */
  function ShareChart({ data, goal }) {
    const W = 700, H = 190, padL = 52, padR = 18, padT = 12, padB = 26;
    const T = window.TL;
    if (!data || data.length < 2) return (
      <div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
        ยังไม่มีข้อมูลเพียงพอตั้งแต่ {window.missionStartLabel()}
      </div>
    );
    const vals = data.map(d => d.value);
    let lo = Math.min(...vals, goal * 0.94), hi = Math.max(...vals, goal * 1.01);
    const span = (hi - lo) || 1;
    lo -= span * 0.06; hi += span * 0.04;
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = i => padL + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const Y = v => padT + ih - ((v - lo) / (hi - lo)) * ih;
    const pts = data.map((d, i) => ({ x: X(i), y: Y(d.value) }));
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const area = path + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (padT + ih).toFixed(1) + ' L' + padL + ',' + (padT + ih).toFixed(1) + ' Z';
    const goalY = Y(goal);
    const yticks = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4);
    const xIdxs = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    return (
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="sc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} stroke="var(--border-soft)" strokeWidth="1" />
            <text x={padL - 6} y={Y(v) + 4} textAnchor="end" fill="var(--text-faint)" fontSize="10.5" fontFamily="inherit">${(v / 1000).toFixed(0)}k</text>
          </g>
        ))}
        {goalY >= padT && goalY <= padT + ih && (
          <>
            <line x1={padL} x2={W - padR} y1={goalY} y2={goalY} stroke="#f87171" strokeDasharray="5 4" strokeWidth="1.5" opacity="0.75" />
            <text x={W - padR - 2} y={goalY - 5} textAnchor="end" fill="#f87171" fontSize="10" fontFamily="inherit" opacity="0.9">Target {window.fmtGoalShort(goal)}</text>
          </>
        )}
        <path d={area} fill="url(#sc-area)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[0].x} cy={pts[0].y} r="3.5" fill="var(--accent)" opacity="0.6" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="5" fill="var(--accent)" stroke="var(--surface-2)" strokeWidth="2" />
        {xIdxs.map(i => (
          <text key={i} x={X(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fill="var(--text-faint)" fontSize="10.5" fontFamily="inherit">
            {T.fmtDateShort(data[i].date)}
          </text>
        ))}
      </svg>
    );
  }

  /* ---- Metric card (inline display) ---- */
  function Metric({ label, icon, value, sub, accent }) {
    return (
      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '11px 13px 10px', borderTop: '3px solid ' + (accent || 'var(--accent)'), flex: '1 1 0', minWidth: 95 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.65px', color: 'var(--text-faint)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{icon}</span><span>{label}</span>
        </div>
        <div className="num" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1, color: 'var(--text)' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{sub}</div>}
      </div>
    );
  }

  /* ---- Inline content (DailyPage + modal) ---- */
  function ShareDailyContent({ d }) {
    const T = d.T;
    const GFULL = window.fmtGoalFull(d.goal);
    const pct = d.progress;
    const streakColor   = d.streakDir === 'up' ? 'var(--pos)' : 'var(--neg)';
    const changeColor   = d.dailyChange >= 0 ? 'var(--pos)' : 'var(--neg)';
    const twrColor      = d.dailyTWR != null && d.dailyTWR >= 0 ? 'var(--pos)' : 'var(--neg)';
    const realizedColor = d.dailyRealized == null ? 'var(--border)' : d.dailyRealized >= 0 ? 'var(--pos)' : 'var(--neg)';
    const isMobile      = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const [copied, setCopied] = useState(false);
    const [imgMsg, setImgMsg] = useState('');
    const [capturing, setCapturing] = useState(false);
    const captureRef = React.useRef(null);

    const tweet = [
      '🎯 Road to ' + GFULL + ' — Day ' + d.dayNum,
      '📅 ' + T.fmtDate(d.today),
      '',
      '💰 Balance: ' + T.fmtMoney(d.lastNLV),
      (d.dailyChange >= 0 ? '▲' : '▼') + ' Daily Change: ' + T.fmtMoneyP(d.dailyChange),
      d.dailyTWR != null ? '📈 TWR: ' + T.fmtPctP(d.dailyTWR, 2) : null,
      d.dailyRealized ? '💵 Realized: ' + T.fmtMoneyP(d.dailyRealized) : null,
      '🏁 Progress: ' + T.fmtPct(pct, 1) + ' → ' + GFULL,
      '',
      '#OptionTradingLog #บันทึกการเทรดออปชั่น ' + goalHash(d.goal),
    ].filter(l => l !== null).join('\n');

    const twitterUrl = 'https://x.com/intent/tweet?text=' + encodeURIComponent(tweet);

    const copyText = () => {
      const fn = () => { setCopied(true); setTimeout(() => setCopied(false), 2200); };
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = tweet; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); fn(); } catch(e) {}
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(tweet).then(fn).catch(fallback);
      else fallback();
    };

    const handleImage = async () => {
      setCapturing(true); setImgMsg('');
      try {
        const filename = 'Fillbook-day' + d.dayNum + '.png';
        let dataURL = null;
        const cs = getComputedStyle(document.documentElement);
        const cssVarNames = ['--bg','--surface','--surface-2','--surface-3','--accent','--accent-2','--accent-soft','--accent-line','--pos','--neg','--pos-bright','--neg-bright','--pos-soft','--neg-soft','--text','--text-dim','--text-faint','--border','--border-soft'];
        // Try html2canvas (pixel-perfect with real fonts)
        if (window.html2canvas && captureRef.current) {
          try {
            const cvs = await window.html2canvas(captureRef.current, {
              scale: 2, logging: false, useCORS: true,
              backgroundColor: cs.getPropertyValue('--bg').trim() || '#0a0d13',
              onclone: (doc) => {
                const style = doc.createElement('style');
                style.textContent = ':root{' + cssVarNames.map(v => v + ':' + cs.getPropertyValue(v).trim()).join(';') + '}';
                doc.head.appendChild(style);
              },
            });
            dataURL = cvs.toDataURL('image/png');
          } catch(e) { console.warn('html2canvas failed, canvas fallback', e); }
        }
        if (!dataURL) dataURL = drawShareCanvas(d, T).toDataURL('image/png');
        if (isMobile) {
          try {
            const res = await fetch(dataURL);
            const blob = await res.blob();
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: 'Road to ' + GFULL + ' — Day ' + d.dayNum });
              setCapturing(false); return;
            }
          } catch(e) {}
        }
        const a = document.createElement('a');
        a.href = dataURL; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setImgMsg('✓ Downloaded! → Attach in X');
        setTimeout(() => setImgMsg(''), 4000);
      } catch(e) { console.error('image error', e); setImgMsg('Error'); }
      setCapturing(false);
    };

    return (
      <div>
        {/* captureRef wraps all visual content for screenshot */}
        <div ref={captureRef}>

        {/* Starting Balance Banner */}
        <div style={{ marginBottom: 12, background: 'linear-gradient(90deg, var(--accent-soft), transparent 90%)', borderLeft: '3px solid var(--accent)', borderRadius: '0 8px 8px 0', padding: '9px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text-faint)' }}>Starting Balance Base · {window.missionStartLabel()}</span>
          <span className="num" style={{ fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap' }}>{T.fmtMoney(d.startingBalance)}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>Target: {GFULL}</span>
        </div>

        {/* Metrics */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Metric label="Streak"          icon="🔥" accent={streakColor}          value={d.streak + ' วัน'}                                         sub={d.streakDir === 'up' ? '▲ Up Days in a row' : '▼ Down Days'} />
          <Metric label="Current Balance" icon="💰" accent="var(--accent)"        value={T.fmtMoney(d.lastNLV)}                                     sub={'from ' + T.fmtMoney(d.startingBalance)} />
          <Metric label="Daily Change"    icon="📊" accent={changeColor}          value={T.fmtMoneyP(d.dailyChange)}                                sub="vs เมื่อวาน" />
          <Metric label="Daily TWR"       icon="📈" accent={twrColor}             value={d.dailyTWR != null ? T.fmtPctP(d.dailyTWR, 2) : '—'}      sub="Time-weighted" />
          <Metric label="Daily Realized"  icon="💵" accent={realizedColor}        value={d.dailyRealized != null ? T.fmtMoneyP(d.dailyRealized) : '—'} sub="P/L วันนี้" />
          <Metric label="Amount Needed"   icon="🏁" accent="oklch(0.65 0.18 275)" value={T.fmtMoney(d.amountNeeded)}                               sub={'เหลืออีก ' + T.fmtPct(1 - pct, 1)} />
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Progress toward {GFULL}</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-2)' }}>{T.fmtPct(pct, 1)}</span>
          </div>
          <div style={{ height: 9, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (pct * 100) + '%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11 }} className="num faint">
            <span>{T.fmtMoney(d.lastNLV)}</span><span>{GFULL}</span>
          </div>
        </div>

        {/* Chart */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '12px 10px 6px', border: '1px solid var(--border-soft)', marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
            <span>🎯</span>
            <span style={{ fontWeight: 500 }}>Road to {GFULL} — From {window.missionStartLabel()}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5 }}>{d.nlvSeries.length} วัน</span>
          </div>
          <ShareChart data={d.nlvSeries} goal={d.goal} />
        </div>

        </div>

        {/* Share actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flex: 1, minWidth: 160 }}>#OptionTradingLog #บันทึกการเทรดออปชั่น {goalHash(d.goal)}</span>
          <button className="btn" onClick={copyText}>{copied ? '✓ Copied!' : 'Copy text'}</button>
          <button className="btn" onClick={handleImage} disabled={capturing} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {capturing ? '⏳' : '📸'} {capturing ? 'กำลังสร้าง…' : imgMsg || (isMobile ? 'Share Image' : 'Copy Image')}
          </button>
          {isMobile ? (
            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7 }}
              onClick={() => navigator.share && navigator.share({ text: tweet }).catch(() => {})}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share text
            </button>
          ) : (
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" /></svg>
              โพสต์ลง X
            </a>
          )}
        </div>
      </div>
    );
  }

  /* ---- Modal wrapper ---- */
  function ShareDailyCard({ onClose }) {
    const d = useDailyShareData();
    const T = d.T;
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9998, backdropFilter: 'blur(6px)' }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 680, boxShadow: '0 32px 96px rgba(0,0,0,.55)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-2) 100%)', padding: '18px 22px 14px', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 20 }}>🎯</span>
                    <span className="num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>Road to {window.fmtGoalFull(d.goal)}</span>
                    <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 999, padding: '2px 11px', fontSize: 12.5, fontWeight: 700 }}>Day {d.dayNum}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Fillbook</span><span style={{ color: 'var(--border)' }}>·</span><span>{T.fmtDate(d.today)}</span>
                  </div>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>✕</button>
              </div>
            </div>
            <div style={{ padding: '14px 22px 20px' }}>
              <ShareDailyContent d={d} />
            </div>
          </div>
        </div>
      </>
    );
  }

  window.ShareDailyCard = ShareDailyCard;
  window.ShareDailyContent = ShareDailyContent;
  window.useDailyShareData = useDailyShareData;
})();
