/* ============================================================
   charts.jsx — lightweight SVG charts. Exports to window:
   LineChart, Sparkline, DonutGauge, MiniBar
   ============================================================ */
(function () {
  const { useState, useRef, useCallback } = React;

  // smooth-ish polyline path from points
  function linePath(pts) {
    if (!pts.length) return '';
    return pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  }

  function LineChart({ data, height = 240, color, fmtY, fmtX, fmtTip, yMin, yMax, areaFill = true, baseline }) {
    const ref = useRef(null);
    const [w, setW] = useState(720);
    const [hover, setHover] = useState(null);
    React.useEffect(() => {
      const el = ref.current; if (!el) return;
      const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
      ro.observe(el); setW(el.clientWidth);
      return () => ro.disconnect();
    }, []);
    color = color || 'var(--accent)';
    const padL = 52, padR = 14, padT = 14, padB = 24;
    const vals = data.map(d => d.value);
    let lo = yMin != null ? yMin : Math.min(...vals);
    let hi = yMax != null ? yMax : Math.max(...vals);
    if (lo === hi) { hi = lo + 1; lo = lo - 1; }
    const pad = (hi - lo) * 0.08; if (yMin == null) lo -= pad; if (yMax == null) hi += pad;
    const iw = Math.max(10, w - padL - padR), ih = height - padT - padB;
    const X = i => padL + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const Y = v => padT + ih - ((v - lo) / (hi - lo)) * ih;
    const pts = data.map((d, i) => ({ x: X(i), y: Y(d.value), d, i }));
    const path = linePath(pts);
    const area = path + ` L${(pts[pts.length - 1] || { x: padL }).x.toFixed(1)},${(padT + ih).toFixed(1)} L${(pts[0] || { x: padL }).x.toFixed(1)},${(padT + ih).toFixed(1)} Z`;
    const ticks = 4;
    const yticks = Array.from({ length: ticks + 1 }, (_, i) => lo + (hi - lo) * i / ticks);
    const gid = 'g' + Math.abs(height + data.length);

    const onMove = useCallback((e) => {
      const r = ref.current.getBoundingClientRect();
      const mx = e.clientX - r.left;
      let best = 0, bd = Infinity;
      pts.forEach(p => { const dd = Math.abs(p.x - mx); if (dd < bd) { bd = dd; best = p.i; } });
      setHover({ ...pts[best], clientX: e.clientX, clientY: r.top + pts[best].y });
    }, [pts]);

    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <svg className="chart-svg" height={height} viewBox={`0 0 ${w} ${height}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="chart-grid">
            {yticks.map((v, i) => (
              <g key={i}>
                <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} />
                <text className="chart-axis" x={padL - 8} y={Y(v) + 3} textAnchor="end">{fmtY ? fmtY(v) : Math.round(v)}</text>
              </g>
            ))}
          </g>
          {baseline != null && baseline >= lo && baseline <= hi && (
            <line x1={padL} x2={w - padR} y1={Y(baseline)} y2={Y(baseline)} stroke="var(--text-faint)" strokeDasharray="3 3" strokeWidth="1" opacity="0.6" />
          )}
          {areaFill && <path d={area} fill={`url(#${gid})`} />}
          <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {data.length > 0 && [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
            <text key={i} className="chart-axis" x={X(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{fmtX ? fmtX(data[i].date, i) : ''}</text>
          ))}
          {hover && (
            <g>
              <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + ih} stroke="var(--text-faint)" strokeWidth="1" opacity="0.5" />
              <circle cx={hover.x} cy={hover.y} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hover && (
          <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
            <div className="tt-d">{fmtX ? fmtX(hover.d.date) : hover.d.date}</div>
            <div className="tt-v">{fmtTip ? fmtTip(hover.d) : (fmtY ? fmtY(hover.d.value) : hover.d.value)}</div>
          </div>
        )}
      </div>
    );
  }

  function Sparkline({ data, width = 92, height = 34, color, fill = true }) {
    if (!data || data.length < 2) return null;
    color = color || 'var(--accent)';
    const lo = Math.min(...data), hi = Math.max(...data);
    const span = hi - lo || 1;
    const X = i => (i / (data.length - 1)) * width;
    const Y = v => height - 3 - ((v - lo) / span) * (height - 6);
    const pts = data.map((v, i) => ({ x: X(i), y: Y(v) }));
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const gid = 'sp' + Math.round(Math.random() * 1e6);
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.32" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {fill && <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gid})`} />}
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  function DonutGauge({ value, size = 116, stroke = 11, color, label, sub }) {
    color = color || 'var(--accent)';
    const r = (size - stroke) / 2, C = 2 * Math.PI * r;
    const off = C * (1 - Math.max(0, Math.min(1, value)));
    return (
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="num" style={{ fontSize: size * 0.22, fontWeight: 700, lineHeight: 1 }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{sub}</div>}
          </div>
        </div>
      </div>
    );
  }

  function MiniBar({ value, max, color, neg }) {
    const pct = max ? Math.min(100, Math.abs(value) / max * 100) : 0;
    return (
      <div className="bartrack">
        <div className="barfill" style={{ width: pct + '%', background: color || (value < 0 ? 'var(--neg)' : 'var(--pos)') }} />
      </div>
    );
  }

  Object.assign(window, { LineChart, Sparkline, DonutGauge, MiniBar });
})();
