/* ============================================================
   components.jsx — shared UI primitives. Exports to window.
   ============================================================ */
(function () {
  const { useState, useEffect, useRef } = React;

  const ICONS = {
    dashboard: 'M3 3h7v8H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h7v7H3z',
    trades: 'M4 5h16M4 12h16M4 19h10',
    daily: 'M3 5h18v16H3zM3 9h18M8 3v4M16 3v4',
    summary: 'M5 21V9M12 21V4M19 21v-8',
    weekly: 'M3 17l5-6 4 4 8-9M21 6h-4M21 6v4',
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
    filter: 'M3 5h18l-7 8v6l-4 2v-8z',
    sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6L4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
    reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    chevDown: 'M6 9l6 6 6-6',
    chevR: 'M9 6l6 6-6 6',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    check: 'M5 12l5 5L20 7',
    layers: 'M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
    target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    wallet: 'M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11l2 3M16 13h2',
    flame: 'M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-2.5C9 9 12 6 12 2z',
    pulse: 'M3 12h4l2-7 4 14 2-7h6',
    coins: 'M12 8m-7 0a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 8v6c0 1.7 3.1 3 7 3s7-1.3 7-3V8',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    xtwitter: 'M4 4l16 16M4 20L20 4',
    share: 'M18 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 19m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  };

  function Icon({ name, size = 18, className = '', style }) {
    const d = ICONS[name] || ICONS.dashboard;
    const filled = name === 'target';
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={style}>
        {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
      </svg>
    );
  }

  function Card({ children, className = '', pad = true, style }) {
    return <div className={'card ' + (pad ? 'card-pad ' : '') + className} style={style}>{children}</div>;
  }

  function StatusBadge({ status }) {
    const map = { Closed: 'badge-closed', Opened: 'badge-opened', Rolled: 'badge-rolled', Pair: 'badge-pair' };
    return <span className={'badge ' + (map[status] || 'badge-pair')}>{status || '—'}</span>;
  }
  function ResultBadge({ result }) {
    if (!result) return <span className="faint">—</span>;
    return <span className={'badge ' + (result === 'Win' ? 'badge-win' : 'badge-loss')}>{result}</span>;
  }

  function PL({ value, dp = 0, big, pct }) {
    const T = window.TL;
    if (value == null || isNaN(value)) return <span className="faint">—</span>;
    const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : 'muted';
    const txt = pct ? T.fmtPctP(value, dp) : T.fmtMoneyP(value, dp);
    return <span className={'num ' + cls} style={big ? { fontWeight: 600 } : null}>{txt}</span>;
  }

  // KPI card
  function KPI({ label, icon, value, sub, delta, deltaUp, spark, sparkColor, accent }) {
    return (
      <div className="card kpi">
        <div className="k-label">{icon && <Icon name={icon} size={14} style={{ color: accent ? 'var(--accent-2)' : 'var(--text-faint)' }} />}{label}</div>
        <div className="k-val">{value}</div>
        <div className="k-sub">
          {delta != null && <span className={'chip ' + (deltaUp === false ? 'down' : deltaUp ? 'up' : 'neutral')}>{delta}</span>}
          {sub}
        </div>
        {spark && <div className="k-spark"><window.Sparkline data={spark} color={sparkColor} /></div>}
      </div>
    );
  }

  // Drawer (right side)
  function Drawer({ open, onClose, title, sub, children, footer, width }) {
    useEffect(() => {
      if (!open) return;
      const h = e => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    }, [open, onClose]);
    if (!open) return null;
    return (
      <>
        <div className="scrim" onClick={onClose} />
        <div className="drawer" style={width ? { width } : null} role="dialog">
          <div className="drawer-head">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
              {sub && <div className="page-sub" style={{ marginTop: 2 }}>{sub}</div>}
            </div>
            <button className="btn btn-ghost icon-btn" onClick={onClose}><Icon name="close" /></button>
          </div>
          <div className="drawer-body">{children}</div>
          {footer && <div className="drawer-foot">{footer}</div>}
        </div>
      </>
    );
  }

  function Field({ label, hint, children, span }) {
    return (
      <div className="field" style={span ? { gridColumn: '1 / -1' } : null}>
        {label && <label>{label}{hint && <span className="hint">{hint}</span>}</label>}
        {children}
      </div>
    );
  }

  function Select({ value, onChange, options, placeholder }) {
    return (
      <select className="select" value={value || ''} onChange={e => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value} disabled={o.disabled} style={o.style}>{o.label}</option>)}
      </select>
    );
  }

  function NumInput({ value, onChange, placeholder, step, mono = true }) {
    return (
      <input className={'input ' + (mono ? 'num' : '')} type="number" step={step || 'any'}
        value={value == null ? '' : value} placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))} />
    );
  }

  function Confirm({ open, onClose, onConfirm, title, body, danger }) {
    if (!open) return null;
    return (
      <>
        <div className="scrim" onClick={onClose} style={{ zIndex: 110 }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 111, width: 380, maxWidth: '92vw' }} className="card card-pad">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 18 }}>{body}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>ยกเลิก</button>
            <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={() => { onConfirm(); onClose(); }}>ยืนยัน</button>
          </div>
        </div>
      </>
    );
  }

  // inline-editable numeric cell
  function EditNum({ value, onSave, fmt, suffix }) {
    const [editing, setEditing] = useState(false);
    const [v, setV] = useState('');
    const ref = useRef(null);
    useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
    if (editing) {
      return <input ref={ref} className="cell-input" type="number" step="any" defaultValue={value == null ? '' : value}
        onChange={e => setV(e.target.value)}
        onBlur={() => { onSave(v === '' ? null : parseFloat(v)); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false); }} />;
    }
    return <span className="editable-cell num" onClick={() => { setV(value == null ? '' : '' + value); setEditing(true); }}>
      {value == null ? <span className="faint">— เพิ่ม</span> : (fmt ? fmt(value) : value)}{suffix}
    </span>;
  }

  Object.assign(window, { Icon, Card, StatusBadge, ResultBadge, PL, KPI, Drawer, Field, Select, NumInput, Confirm, EditNum });
})();
